import { Injectable } from '@nestjs/common';
import { AssignmentEndReason, MentorAssignment, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../database/prisma.service';
import { table } from '../database/sql';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { AppError, badRequest, conflict, notFound } from '../common/errors/app-error';
import { log } from '../common/logging/logger';

const OPEN = ['PENDING', 'ACTIVE'] as const;

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Who mentors whom. Only an admin creates links; the client must accept before anything is shared.
 * The database guarantees one open (pending/active) assignment per client (partial unique index).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────

  /** Assign, or reassign (the old link is ENDED as REASSIGNED and a new PENDING link is created). */
  async assign(admin: AuthUser, input: { clientId: string; mentorId: string; note?: string; overrideCapacity?: boolean }) {
    try {
      return await this.prisma.tx(async (tx) => {
        const [client, mentor] = await Promise.all([
          tx.user.findFirst({ where: { id: input.clientId, role: 'USER', isActive: true } }),
          tx.user.findFirst({ where: { id: input.mentorId, role: 'MENTOR', isActive: true }, include: { mentorProfile: true } }),
        ]);
        if (!client) throw notFound('Client');
        if (!mentor) throw notFound('Mentor');

        // Serialise concurrent assignments for the same mentor so the capacity check can't be raced.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'mentor-capacity:' + mentor.id}))`;
        const current = await tx.mentorAssignment.findFirst({ where: { clientId: client.id, status: { in: [...OPEN] } } });
        if (current?.mentorId === mentor.id) throw conflict('ALREADY_ASSIGNED', `${client.name} is already assigned to ${mentor.name}.`);

        const capacity = mentor.mentorProfile?.capacity ?? 15;
        const load = await tx.mentorAssignment.count({ where: { mentorId: mentor.id, status: { in: [...OPEN] } } });
        if (load >= capacity && !input.overrideCapacity) {
          throw new AppError('MENTOR_AT_CAPACITY', `${mentor.name} already has ${load} of ${capacity} clients. Confirm to assign anyway.`, 409, { load, capacity });
        }

        if (current) await this.endInTx(tx, current, 'REASSIGNED', admin.id);
        const assignment = await tx.mentorAssignment.create({
          data: { mentorId: mentor.id, clientId: client.id, assignedById: admin.id, note: input.note?.trim() || null },
        });
        await this.audit.record(
          { userId: client.id, actorId: admin.id, action: 'ASSIGNMENT_CREATED', entityType: 'MentorAssignment', entityId: assignment.id, metadata: { mentorId: mentor.id, reassignedFrom: current?.mentorId ?? null } },
          tx,
        );
        await this.notifications.createOnce(tx, {
          userId: client.id,
          type: 'ASSIGNMENT',
          dedupeKey: `ASSIGNMENT_REQUEST:${assignment.id}`,
          title: `${mentor.name} would like to be your mentor`,
          body: 'Accept to share your progress, check-ins, reflections and evidence. Nothing is shared until you accept.',
          scheduledAt: new Date(),
          link: '/app/dashboard',
        });
        log.info('assignment_created', { assignmentId: assignment.id, clientId: client.id, mentorId: mentor.id });
        return assignment;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('ASSIGNMENT_CONFLICT', 'This client was just assigned by someone else. Refresh and try again.');
      throw e;
    }
  }

  async endByAdmin(admin: AuthUser, assignmentId: string) {
    return this.prisma.tx(async (tx) => {
      const a = await tx.mentorAssignment.findFirst({ where: { id: assignmentId, status: { in: [...OPEN] } } });
      if (!a) throw notFound('Assignment');
      return this.endInTx(tx, a, 'UNASSIGNED', admin.id);
    });
  }

  history(clientId: string) {
    return this.prisma.mentorAssignment
      .findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, include: { mentor: { select: { id: true, name: true } } } })
      .then(async (rows) => {
        const actorIds = [...new Set(rows.flatMap((r) => [r.assignedById, r.endedById]).filter((x): x is string => !!x))];
        const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
        const name = (id: string | null) => (id ? (actors.find((a) => a.id === id)?.name ?? 'Unknown') : null);
        return rows.map((r) => ({
          id: r.id,
          mentor: r.mentor,
          status: r.status,
          assignedBy: name(r.assignedById),
          createdAt: r.createdAt,
          acceptedAt: r.acceptedAt,
          endedAt: r.endedAt,
          endedBy: name(r.endedById),
          endReason: r.endReason,
          note: r.note,
        }));
      });
  }

  // ── Client ───────────────────────────────────────────────────────────

  async mine(user: AuthUser) {
    const a = await this.prisma.mentorAssignment.findFirst({
      where: { clientId: user.id, status: { in: [...OPEN] } },
      include: { mentor: { select: { id: true, name: true, mentorProfile: { select: { bio: true, headline: true, focusAreas: true, languages: true } } } } },
    });
    const [me, nextSession, openActions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true, mentorWhatsappOptIn: true } }),
      a?.status === 'ACTIVE'
        ? this.prisma.mentorSession.findFirst({ where: { assignmentId: a.id, status: 'SCHEDULED', startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, select: { startsAt: true, channel: true } })
        : null,
      a?.status === 'ACTIVE' ? this.prisma.actionItem.count({ where: { clientId: user.id, owner: 'CLIENT', status: 'OPEN' } }) : 0,
    ]);
    return {
      assignment: a && {
        id: a.id,
        status: a.status,
        selfSelected: a.assignedById === user.id,
        mentor: {
          id: a.mentor.id,
          name: a.mentor.name,
          bio: a.mentor.mentorProfile?.bio ?? null,
          headline: a.mentor.mentorProfile?.headline ?? null,
          focusAreas: a.mentor.mentorProfile?.focusAreas ?? [],
          languages: a.mentor.mentorProfile?.languages ?? [],
        },
        since: a.acceptedAt ?? a.createdAt,
        requestedAt: a.createdAt,
        nextSession,
        openActions,
      },
      whatsapp: { optIn: me.mentorWhatsappOptIn, phone: me.phone },
    };
  }

  async accept(user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const a = await tx.mentorAssignment.findFirst({ where: { clientId: user.id, status: 'PENDING' }, include: { mentor: true } });
      if (!a) throw notFound('Mentor request');
      const updated = await tx.mentorAssignment.update({ where: { id: a.id }, data: { status: 'ACTIVE', acceptedAt: new Date() } });
      await this.audit.record({ userId: user.id, action: 'ASSIGNMENT_ACCEPTED', entityType: 'MentorAssignment', entityId: a.id }, tx);
      await this.notifications.createOnce(tx, {
        userId: a.mentorId,
        type: 'ASSIGNMENT',
        dedupeKey: `ASSIGNMENT_ACCEPTED:${a.id}`,
        title: `${user.name} accepted you as their mentor`,
        body: 'They now appear on your board.',
        scheduledAt: new Date(),
        link: `/mentor/clients/detail?id=${user.id}`,
        subjectId: user.id,
      });
      return { id: updated.id, status: updated.status };
    });
  }

  async decline(user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const a = await tx.mentorAssignment.findFirst({ where: { clientId: user.id, status: 'PENDING' } });
      if (!a) throw notFound('Mentor request');
      return this.endInTx(tx, a, 'DECLINED', user.id);
    });
  }

  async stopSharing(user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const a = await tx.mentorAssignment.findFirst({ where: { clientId: user.id, status: 'ACTIVE' } });
      if (!a) throw notFound('Mentor');
      return this.endInTx(tx, a, 'CLIENT_STOPPED', user.id);
    });
  }

  async setWhatsapp(user: AuthUser, input: { optIn: boolean; phone?: string | null }) {
    const phone = input.phone === undefined ? undefined : input.phone ? input.phone.replace(/[\s()-]/g, '') : null;
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true } });
    if (input.optIn && !(phone ?? current.phone)) throw badRequest('PHONE_REQUIRED', 'Add your WhatsApp number first.');
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { mentorWhatsappOptIn: input.optIn, ...(phone !== undefined ? { phone } : {}) } });
      await this.audit.record({ userId: user.id, action: 'WHATSAPP_OPT_IN_CHANGED', entityType: 'User', entityId: user.id, metadata: { optIn: input.optIn } }, tx);
    });
    return this.mine(user);
  }

  // ── Shared ───────────────────────────────────────────────────────────

  /** End every open assignment of a user (deactivated mentor or client). */
  async endAllFor(tx: Tx, userId: string, actorId: string) {
    const open = await tx.mentorAssignment.findMany({ where: { OR: [{ mentorId: userId }, { clientId: userId }], status: { in: [...OPEN] } } });
    for (const a of open) await this.endInTx(tx, a, 'ACCOUNT_DEACTIVATED', actorId);
    return open.length;
  }

  /**
   * Ends a link and everything hanging off it, atomically: future sessions are cancelled, their queued
   * reminders deleted and the mentor's nudge rules switched off. Access stops on the mentor's next request.
   */
  async endInTx(tx: Tx, a: MentorAssignment, reason: AssignmentEndReason, actorId: string, opts: { switching?: boolean } = {}) {
    const now = new Date();
    const res = await tx.mentorAssignment.updateMany({
      where: { id: a.id, status: { in: [...OPEN] } },
      data: { status: 'ENDED', endedAt: now, endedById: actorId, endReason: reason },
    });
    if (res.count === 0) throw conflict('ASSIGNMENT_ALREADY_ENDED', 'This assignment has already ended.');

    const sessions = await tx.mentorSession.findMany({ where: { assignmentId: a.id, status: 'SCHEDULED', startsAt: { gt: now } }, select: { id: true } });
    if (sessions.length) {
      const ids = sessions.map((s) => s.id);
      await tx.mentorSession.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED' } });
      await tx.$executeRaw`DELETE FROM ${table('Job')} WHERE "status" = 'QUEUED' AND "name" = 'session-reminder' AND "payload"->>'sessionId' = ANY(${ids}::text[])`;
    }
    await tx.nudgeRule.updateMany({ where: { mentorId: a.mentorId, clientId: a.clientId, active: true }, data: { active: false } });

    await this.audit.record(
      { userId: a.clientId, actorId, action: 'ASSIGNMENT_ENDED', entityType: 'MentorAssignment', entityId: a.id, metadata: { reason, mentorId: a.mentorId, cancelledSessions: sessions.length, switching: !!opts.switching } },
      tx,
    );
    const [client, mentor] = await Promise.all([
      tx.user.findUnique({ where: { id: a.clientId }, select: { name: true } }),
      tx.user.findUnique({ where: { id: a.mentorId }, select: { name: true } }),
    ]);
    if (a.status === 'ACTIVE' && actorId !== a.mentorId) {
      await this.notifications.createOnce(tx, {
        userId: a.mentorId,
        type: 'ASSIGNMENT',
        dedupeKey: `ASSIGNMENT_ENDED:${a.id}`,
        title: `${client?.name ?? 'A client'} is no longer on your board`,
        body: opts.switching ? 'They chose a different mentor.' : reason === 'CLIENT_STOPPED' ? 'They chose to stop sharing.' : 'The admin changed this assignment.',
        scheduledAt: now,
        link: '/mentor',
      });
    }
    if (!opts.switching && (reason === 'CLIENT_STOPPED' || reason === 'DECLINED')) {
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
      for (const admin of admins) {
        await this.notifications.createOnce(tx, {
          userId: admin.id,
          type: 'ASSIGNMENT',
          dedupeKey: `ASSIGNMENT_${reason}:${a.id}`,
          title: reason === 'DECLINED' ? `${client?.name} declined ${mentor?.name} as mentor` : `${client?.name} stopped sharing with ${mentor?.name}`,
          body: 'They are back in the unassigned list.',
          scheduledAt: now,
          link: '/admin/clients?filter=unassigned',
          subjectId: a.clientId,
        });
      }
    }
    log.info('assignment_ended', { assignmentId: a.id, reason });
    return { id: a.id, status: 'ENDED' as const, endReason: reason };
  }
}
