import { Injectable } from '@nestjs/common';
import { GoalCategory, MentorProfile, Prisma, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { AppError, conflict, notFound } from '../common/errors/app-error';
import { log } from '../common/logging/logger';
import { AssignmentsService } from './assignments.service';

const OPEN = ['PENDING', 'ACTIVE'] as const;
const DEFAULT_CAPACITY = 15;

export interface DirectoryMentor {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  focusAreas: GoalCategory[];
  languages: string[];
  spotsLeft: number;
  available: boolean;
  /** Goal categories of the client's active goals that this mentor covers. */
  matches: GoalCategory[];
  activeClients: number;
  memberSince: Date;
  current: boolean;
}

function presentProfile(p: MentorProfile | null) {
  return {
    headline: p?.headline ?? null,
    bio: p?.bio ?? null,
    focusAreas: p?.focusAreas ?? [],
    languages: p?.languages ?? [],
    acceptingClients: p?.acceptingClients ?? true,
    capacity: p?.capacity ?? DEFAULT_CAPACITY,
  };
}

/**
 * Self-service mentor selection. A client browses mentors who accept clients and have free capacity, and picks
 * one; choosing is the client's consent, so the assignment starts ACTIVE immediately and the mentor is told.
 * Admins can still assign, reassign and unassign at any time.
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly assignments: AssignmentsService,
  ) {}

  async list(user: AuthUser): Promise<DirectoryMentor[]> {
    const [mentors, goals, current] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'MENTOR', isActive: true },
        include: { mentorProfile: true, _count: { select: { mentoring: { where: { status: { in: [...OPEN] } } } } } },
      }),
      this.prisma.goal.findMany({ where: { userId: user.id, status: { in: ['ACTIVE', 'DRAFT', 'PAUSED'] } }, select: { category: true } }),
      this.prisma.mentorAssignment.findFirst({ where: { clientId: user.id, status: { in: [...OPEN] } }, select: { mentorId: true } }),
    ]);
    const categories = new Set(goals.map((g) => g.category));
    const rows = mentors.map((m): DirectoryMentor => {
      const p = presentProfile(m.mentorProfile);
      const spotsLeft = Math.max(0, p.capacity - m._count.mentoring);
      return {
        id: m.id,
        name: m.name,
        headline: p.headline,
        bio: p.bio,
        focusAreas: p.focusAreas,
        languages: p.languages,
        spotsLeft,
        available: p.acceptingClients && spotsLeft > 0,
        matches: p.focusAreas.filter((f) => categories.has(f)),
        activeClients: m._count.mentoring,
        memberSince: m.createdAt,
        current: current?.mentorId === m.id,
      };
    });
    // Listed only when accepting clients and the profile says who they are (headline or bio);
    // a client's current mentor is always shown.
    const listed = (r: DirectoryMentor) => {
      const p = mentors.find((m) => m.id === r.id)!.mentorProfile;
      return p?.acceptingClients !== false && !!(p?.headline || p?.bio);
    };
    return rows
      .filter((r) => r.current || listed(r))
      .sort((a, b) => Number(b.available) - Number(a.available) || b.matches.length - a.matches.length || b.spotsLeft - a.spotsLeft || a.name.localeCompare(b.name));
  }

  async choose(user: AuthUser, input: { mentorId: string; message?: string }) {
    const message = input.message?.trim() || null;
    try {
      const result = await this.prisma.tx(async (tx) => {
        // One choice at a time per client, and capacity checks serialised per mentor (same lock as admin assignment).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'client-assign:' + user.id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'mentor-capacity:' + input.mentorId}))`;
        const mentor = await tx.user.findFirst({ where: { id: input.mentorId, role: 'MENTOR', isActive: true }, include: { mentorProfile: true } });
        if (!mentor) throw notFound('Mentor');
        const p = presentProfile(mentor.mentorProfile);
        const current = await tx.mentorAssignment.findFirst({ where: { clientId: user.id, status: { in: [...OPEN] } } });

        if (current?.mentorId === mentor.id) {
          if (current.status === 'ACTIVE') throw conflict('ALREADY_ASSIGNED', `${mentor.name} is already your mentor.`);
          // An admin had proposed this same mentor: choosing them is accepting.
          const accepted = await tx.mentorAssignment.update({ where: { id: current.id }, data: { status: 'ACTIVE', acceptedAt: new Date(), note: message ?? current.note } });
          await this.audit.record({ userId: user.id, action: 'ASSIGNMENT_ACCEPTED', entityType: 'MentorAssignment', entityId: current.id }, tx);
          await this.notifyMentor(tx, user, mentor, accepted.id, message);
          return accepted;
        }

        if (!p.acceptingClients) throw new AppError('MENTOR_NOT_ACCEPTING', `${mentor.name} isn’t taking new clients right now. Please choose another mentor.`, 409);
        const load = await tx.mentorAssignment.count({ where: { mentorId: mentor.id, status: { in: [...OPEN] } } });
        if (load >= p.capacity) throw new AppError('MENTOR_AT_CAPACITY', `${mentor.name} is fully booked right now. Please choose another mentor.`, 409, { load, capacity: p.capacity });

        if (current) await this.assignments.endInTx(tx, current, current.status === 'PENDING' ? 'DECLINED' : 'CLIENT_STOPPED', user.id, { switching: true });
        const assignment = await tx.mentorAssignment.create({
          data: { mentorId: mentor.id, clientId: user.id, assignedById: user.id, status: 'ACTIVE', acceptedAt: new Date(), note: message },
        });
        await this.audit.record(
          { userId: user.id, action: 'ASSIGNMENT_CREATED', entityType: 'MentorAssignment', entityId: assignment.id, metadata: { mentorId: mentor.id, selfSelected: true, switchedFrom: current?.mentorId ?? null } },
          tx,
        );
        await this.notifyMentor(tx, user, mentor, assignment.id, message);
        return assignment;
      });
      log.info('mentor_chosen', { clientId: user.id, mentorId: input.mentorId });
      return this.assignments.mine(user).then((m) => ({ ...m, chosenAssignmentId: result.id }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('ASSIGNMENT_CONFLICT', 'Your mentor was just changed somewhere else. Refresh and try again.');
      }
      throw e;
    }
  }

  private notifyMentor(tx: Prisma.TransactionClient, client: AuthUser, mentor: User, assignmentId: string, message: string | null) {
    return this.notifications.createOnce(tx, {
      userId: mentor.id,
      type: 'ASSIGNMENT',
      dedupeKey: `ASSIGNMENT_CHOSEN:${assignmentId}`,
      title: `${client.name} chose you as their mentor`,
      body: message ? `“${message.slice(0, 200)}”` : 'Say hello and book a first call.',
      scheduledAt: new Date(),
      link: `/mentor/clients/detail?id=${client.id}`,
      subjectId: client.id,
    });
  }

  // ── The mentor's own directory profile ──────────────────────────────

  async profile(mentor: AuthUser) {
    const p = await this.prisma.mentorProfile.upsert({ where: { userId: mentor.id }, create: { userId: mentor.id }, update: {} });
    const load = await this.prisma.mentorAssignment.count({ where: { mentorId: mentor.id, status: { in: [...OPEN] } } });
    return { ...presentProfile(p), activeClients: load, listed: p.acceptingClients && !!(p.headline || p.bio) };
  }

  async updateProfile(mentor: AuthUser, input: { headline?: string | null; bio?: string | null; focusAreas?: GoalCategory[]; languages?: string[]; acceptingClients?: boolean }) {
    const data = {
      ...(input.headline !== undefined ? { headline: input.headline?.trim() || null } : {}),
      ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
      ...(input.focusAreas ? { focusAreas: [...new Set(input.focusAreas)] } : {}),
      ...(input.languages ? { languages: [...new Set(input.languages.map((l) => l.trim()).filter(Boolean))] } : {}),
      ...(input.acceptingClients !== undefined ? { acceptingClients: input.acceptingClients } : {}),
    };
    await this.prisma.mentorProfile.upsert({ where: { userId: mentor.id }, create: { userId: mentor.id, ...data }, update: data });
    return this.profile(mentor);
  }
}
