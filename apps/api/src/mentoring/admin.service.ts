import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { badRequest, notFound } from '../common/errors/app-error';
import { addDays, fromDbDate, todayIn, toDbDate } from '../domain/dates';
import { STATUS_ORDER } from '../domain/mentoring';
import { AssignmentsService } from './assignments.service';
import { ClientInsightsService } from './client-insights.service';
import { RESPONSE_WINDOW_MS } from './nudges.service';

const NUDGE_RESPONSE_HOURS = 6;

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Admin screens: overview, mentors, clients, account state and the audit trail. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignments: AssignmentsService,
    private readonly insights: ClientInsightsService,
  ) {}

  async overview(admin: AuthUser, now = new Date()) {
    const today = todayIn(admin.timezone, now);
    const [clients, mentors, open, pendingInvites, checkInsToday, missedYesterday] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'USER', isActive: true } }),
      this.prisma.user.count({ where: { role: 'MENTOR', isActive: true } }),
      this.prisma.mentorAssignment.findMany({ where: { status: { in: ['PENDING', 'ACTIVE'] } }, select: { clientId: true, status: true } }),
      this.prisma.mentorInvite.count({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.checkIn.count({ where: { date: toDbDate(today), status: { in: ['COMPLETED', 'LATE'] } } }),
      this.prisma.checkIn.count({ where: { date: toDbDate(addDays(today, -1)), status: 'MISSED' } }),
    ]);
    const openIds = new Set(open.map((o) => o.clientId));
    const activeIds = new Set(open.filter((o) => o.status === 'ACTIVE').map((o) => o.clientId));
    const snaps = await this.insights.snapshots(clients, now);
    const counts = { NEEDS_ATTENTION: 0, WATCH: 0, ON_TRACK: 0, INACTIVE: 0 };
    for (const s of snaps.values()) counts[s.status]++;
    return {
      date: today,
      clients: clients.length,
      mentors,
      unassigned: clients.filter((c) => !openIds.has(c.id)).length,
      pendingAssignments: open.filter((o) => o.status === 'PENDING').length,
      mentored: activeIds.size,
      pendingInvites,
      checkInsToday,
      missedCheckInsYesterday: missedYesterday,
      needsAttention: counts.NEEDS_ATTENTION,
      statusCounts: counts,
    };
  }

  async mentors() {
    const rows = await this.prisma.user.findMany({
      where: { role: 'MENTOR' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { mentorProfile: true, mentoring: { where: { status: { in: ['PENDING', 'ACTIVE'] } }, select: { status: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      isActive: m.isActive,
      capacity: m.mentorProfile?.capacity ?? 15,
      activeClients: m.mentoring.filter((a) => a.status === 'ACTIVE').length,
      pendingClients: m.mentoring.filter((a) => a.status === 'PENDING').length,
      lastActiveAt: m.lastActiveAt,
      joinedAt: m.createdAt,
    }));
  }

  async clients(input: { filter?: 'all' | 'unassigned' | 'attention' | 'pending'; q?: string }, now = new Date()) {
    const where: Prisma.UserWhereInput = {
      role: 'USER',
      ...(input.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { email: { contains: input.q, mode: 'insensitive' } }] } : {}),
    };
    const users = await this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, take: 500 });
    const open = await this.prisma.mentorAssignment.findMany({
      where: { clientId: { in: users.map((u) => u.id) }, status: { in: ['PENDING', 'ACTIVE'] } },
      include: { mentor: { select: { id: true, name: true } } },
    });
    const snaps = await this.insights.snapshots(users.filter((u) => u.isActive), now);
    let rows = users.map((u) => {
      const a = open.find((o) => o.clientId === u.id);
      const s = snaps.get(u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        timezone: u.timezone,
        joinedAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
        status: s?.status ?? 'INACTIVE',
        reasons: s?.reasons ?? [],
        streak: s?.streak ?? 0,
        assignment: a ? { id: a.id, status: a.status, mentor: a.mentor, since: a.acceptedAt ?? a.createdAt } : null,
      };
    });
    if (input.filter === 'unassigned') rows = rows.filter((r) => r.isActive && !r.assignment);
    if (input.filter === 'pending') rows = rows.filter((r) => r.assignment?.status === 'PENDING');
    if (input.filter === 'attention') rows = rows.filter((r) => r.isActive && r.status === 'NEEDS_ATTENTION');
    rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
    return rows;
  }

  async clientHistory(clientId: string) {
    const client = await this.prisma.user.findFirst({ where: { id: clientId, role: 'USER' }, select: { id: true, name: true, email: true, isActive: true, createdAt: true } });
    if (!client) throw notFound('Client');
    return { client, assignments: await this.assignments.history(clientId) };
  }

  async setCapacity(admin: AuthUser, mentorId: string, capacity: number) {
    const mentor = await this.prisma.user.findFirst({ where: { id: mentorId, role: 'MENTOR' } });
    if (!mentor) throw notFound('Mentor');
    await this.prisma.mentorProfile.upsert({ where: { userId: mentorId }, create: { userId: mentorId, capacity }, update: { capacity } });
    await this.audit.record({ userId: mentorId, actorId: admin.id, action: 'MENTOR_CAPACITY_CHANGED', entityType: 'User', entityId: mentorId, metadata: { capacity } });
    return { id: mentorId, capacity };
  }

  /** Deactivation signs the person out everywhere (tokenVersion) and ends their open assignments. */
  async setActive(admin: AuthUser, userId: string, active: boolean) {
    if (userId === admin.id) throw badRequest('CANNOT_DEACTIVATE_SELF', 'You can’t deactivate your own account.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('User');
    if (user.role === 'ADMIN') throw badRequest('CANNOT_DEACTIVATE_ADMIN', 'Admins are managed from the command line.');
    const ended = await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: active ? { isActive: true } : { isActive: false, tokenVersion: { increment: 1 } } });
      const n = active ? 0 : await this.assignments.endAllFor(tx, userId, admin.id);
      await this.audit.record({ userId, actorId: admin.id, action: active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', entityType: 'User', entityId: userId, metadata: { endedAssignments: n } }, tx);
      return n;
    });
    return { id: userId, isActive: active, endedAssignments: ended };
  }

  /** How each mentor is doing over the last 30 days (function 31). */
  async mentorActivity(mentorId: string, now = new Date()) {
    const mentor = await this.prisma.user.findFirst({ where: { id: mentorId, role: 'MENTOR' }, include: { mentorProfile: true } });
    if (!mentor) throw notFound('Mentor');
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const today = todayIn(mentor.timezone, now);
    const active = await this.prisma.mentorAssignment.findMany({ where: { mentorId, status: 'ACTIVE' }, include: { client: true } });
    const clientIds = active.map((a) => a.clientId);

    const [sessions, notes, nudges, overdue, alerts, consistencyDays] = await Promise.all([
      this.prisma.mentorSession.groupBy({ by: ['status'], where: { mentorId, startsAt: { gte: since, lte: now } }, _count: { _all: true } }),
      this.prisma.mentorNote.count({ where: { authorId: mentorId, createdAt: { gte: since }, isDraft: false } }),
      this.prisma.nudge.findMany({ where: { mentorId, sentAt: { gte: since } }, select: { sentAt: true, respondedAt: true, ruleId: true } }),
      this.prisma.actionItem.count({ where: { mentorId, owner: 'MENTOR', status: 'OPEN', dueDate: { lt: toDbDate(today) } } }),
      this.prisma.notification.findMany({ where: { userId: mentorId, type: 'MENTOR_ALERT', createdAt: { gte: since }, subjectId: { not: null } }, select: { createdAt: true, subjectId: true } }),
      this.prisma.dailyAccountability.findMany({
        where: { userId: { in: clientIds }, isFinal: true, isRestDay: false, plannedCount: { gt: 0 }, date: { gte: toDbDate(addDays(today, -30)) } },
        select: { userId: true, isSuccessful: true },
      }),
    ]);

    // Response time = from an alert to the mentor's first action on that client (review, note, nudge or booked session).
    const responseMinutes: number[] = [];
    for (const a of alerts) {
      const cid = a.subjectId!;
      const firsts = await Promise.all([
        this.prisma.mentorReview.findFirst({ where: { mentorId, clientId: cid, createdAt: { gte: a.createdAt } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        this.prisma.mentorNote.findFirst({ where: { authorId: mentorId, clientId: cid, createdAt: { gte: a.createdAt } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        this.prisma.nudge.findFirst({ where: { mentorId, clientId: cid, ruleId: null, sentAt: { gte: a.createdAt } }, orderBy: { sentAt: 'asc' }, select: { sentAt: true } }),
        this.prisma.mentorSession.findFirst({ where: { mentorId, clientId: cid, createdAt: { gte: a.createdAt } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ]);
      const times = firsts.map((f) => (f ? ('sentAt' in f ? f.sentAt : f.createdAt) : null)).filter((d): d is Date => !!d);
      if (times.length) responseMinutes.push(Math.round((Math.min(...times.map((d) => d.getTime())) - a.createdAt.getTime()) / 60_000));
    }

    const manual = nudges.filter((n) => !n.ruleId);
    const answered = nudges.filter((n) => n.respondedAt && n.respondedAt.getTime() - n.sentAt.getTime() <= NUDGE_RESPONSE_HOURS * 3_600_000);
    const count = (s: string) => sessions.find((x) => x.status === s)?._count._all ?? 0;
    const perClient = active.map((a) => {
      const mine = consistencyDays.filter((d) => d.userId === a.clientId);
      return mine.length ? Math.round((mine.filter((d) => d.isSuccessful).length / mine.length) * 100) : null;
    });
    const known = perClient.filter((x): x is number => x !== null);

    return {
      mentor: { id: mentor.id, name: mentor.name, email: mentor.email, isActive: mentor.isActive, capacity: mentor.mentorProfile?.capacity ?? 15, lastActiveAt: mentor.lastActiveAt, joinedAt: mentor.createdAt },
      windowDays: 30,
      activeClients: active.length,
      sessionsHeld: count('DONE'),
      sessionsNoShow: count('NO_SHOW'),
      sessionsCancelled: count('CANCELLED'),
      notesWritten: notes,
      nudgesSent: manual.length,
      automaticNudges: nudges.length - manual.length,
      nudgeResponseRate: nudges.length ? Math.round((answered.length / nudges.length) * 100) : null,
      nudgeResponseWindowHours: NUDGE_RESPONSE_HOURS,
      alerts: alerts.length,
      alertsActedOn: responseMinutes.length,
      medianResponseMinutes: median(responseMinutes),
      overdueFollowUps: overdue,
      clientsAverageConsistency: known.length ? Math.round(known.reduce((s, x) => s + x, 0) / known.length) : null,
      clients: active.map((a, i) => ({ id: a.clientId, name: a.client.name, consistency: perClient[i], since: a.acceptedAt ?? a.createdAt })),
      responseWindowHours: RESPONSE_WINDOW_MS / 3_600_000,
    };
  }

  async auditLog(input: { userId?: string; actorId?: string; action?: string; before?: string; limit?: number }) {
    const take = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const before = input.before ? new Date(input.before) : undefined;
    if (before && Number.isNaN(before.getTime())) throw badRequest('INVALID_CURSOR', 'before must be an ISO timestamp');
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.actorId ? { actorId: input.actorId } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      include: { user: { select: { id: true, name: true } }, actor: { select: { id: true, name: true, role: true } } },
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, metadata: r.metadata, createdAt: r.createdAt, subject: r.user, actor: r.actor })),
      nextBefore: rows.length > take ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  /** Users for the audit filter pickers. */
  async people() {
    return this.prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: 'asc' }, take: 1000 });
  }

  /** For the day-strip "Missed check-ins yesterday" drill-down. */
  async missedCheckIns(admin: AuthUser) {
    const y = addDays(todayIn(admin.timezone), -1);
    const rows = await this.prisma.checkIn.findMany({ where: { date: toDbDate(y), status: 'MISSED' }, include: { user: { select: { id: true, name: true } } } });
    return rows.map((r) => ({ clientId: r.userId, name: r.user.name, date: fromDbDate(r.date) }));
  }
}
