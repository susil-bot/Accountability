import { Injectable } from '@nestjs/common';
import { CheckIn, DailyAccountability, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService, presentDay } from '../analytics/analytics.service';
import { EvidenceService } from '../evidence/evidence.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { badRequest } from '../common/errors/app-error';
import { addDays, dateRange, endOfLocalDay, fromDbDate, isValidLocalDate, LocalDate, startOfLocalDay, todayIn, toDbDate } from '../domain/dates';
import { dayBand } from '../domain/scoring';
import { blockerLabel, clientStatus, ClientStatus, DaySignal, STATUS_ORDER, whatsappLink } from '../domain/mentoring';
import { MentorAccessService } from './mentor-access.service';

/** Days without any contact (session, nudge or note) before the board flags the client. */
export const NO_CONTACT_FLAG_DAYS = 7;

export interface ClientSnapshot {
  today: LocalDate;
  status: ClientStatus;
  reasons: string[];
  todayDay: { planned: number; completed: number; percentage: number };
  checkIn: CheckIn['status'] | 'NONE';
  streak: number;
  longestStreak: number;
  trend: { date: LocalDate; score: number; band: string }[];
  topBlocker: { reason: string; label: string; count: number } | null;
  lastActiveAt: Date | null;
}

/** An AuthUser-shaped view of a client, so the existing analytics can be reused read-only. */
export function asSubject(u: User): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, checkInTime: u.checkInTime, restDays: u.restDays };
}

/** Never let a private reflection leave the server for a mentor. */
function redactCheckIn<T extends { reflection?: string | null; reflectionPrivate?: boolean } | null>(c: T): T {
  if (!c || !c.reflectionPrivate) return c;
  return { ...c, reflection: null };
}

/**
 * Read-only views of clients for mentors and admins: the board, the client page, the timeline and "My day".
 * Every per-client method goes through MentorAccessService first.
 */
@Injectable()
export class ClientInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
    private readonly analytics: AnalyticsService,
    private readonly evidence: EvidenceService,
    private readonly audit: AuditService,
  ) {}

  /** Status, today's progress and trend for many clients with a constant number of queries. */
  async snapshots(clients: User[], now = new Date()): Promise<Map<string, ClientSnapshot>> {
    const out = new Map<string, ClientSnapshot>();
    if (clients.length === 0) return out;
    const ids = clients.map((c) => c.id);
    const todays = new Map(clients.map((c) => [c.id, todayIn(c.timezone, now)]));
    const minToday = [...todays.values()].sort()[0];
    const from = addDays(minToday, -8);

    const [days, checkIns, streaks, recentCheckIns] = await Promise.all([
      this.prisma.dailyAccountability.findMany({ where: { userId: { in: ids }, date: { gte: toDbDate(from) } } }),
      this.prisma.checkIn.findMany({ where: { userId: { in: ids }, date: { in: [...new Set(todays.values())].map(toDbDate) } } }),
      this.prisma.streak.findMany({ where: { userId: { in: ids } } }),
      this.prisma.checkIn.findMany({ where: { userId: { in: ids }, date: { gte: toDbDate(addDays(minToday, -7)) } }, select: { userId: true, date: true, blockers: true } }),
    ]);
    const daysBy = new Map<string, DailyAccountability[]>();
    for (const d of days) daysBy.set(d.userId, [...(daysBy.get(d.userId) ?? []), d]);

    for (const c of clients) {
      const today = todays.get(c.id)!;
      const mine = (daysBy.get(c.id) ?? []).filter((d) => fromDbDate(d.date) <= today);
      const byDate = new Map(mine.map((d) => [fromDbDate(d.date), d]));
      const signals: DaySignal[] = mine.map((d) => ({
        date: fromDbDate(d.date),
        plannedCount: d.plannedCount,
        completionPercentage: d.completionPercentage,
        checkInCompleted: d.checkInCompleted,
        isRestDay: d.isRestDay,
        isFinal: d.isFinal,
      }));
      const { status, reasons } = clientStatus({ days: signals, today, lastActiveAt: c.lastActiveAt, createdAt: c.createdAt, now });
      const t = byDate.get(today);
      const ci = checkIns.find((x) => x.userId === c.id && fromDbDate(x.date) === today);
      const st = streaks.find((s) => s.userId === c.id);
      const counts: Record<string, number> = {};
      for (const r of recentCheckIns) if (r.userId === c.id && fromDbDate(r.date) >= addDays(today, -6)) for (const b of r.blockers) counts[b] = (counts[b] ?? 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      out.set(c.id, {
        today,
        status,
        reasons,
        todayDay: { planned: t?.plannedCount ?? 0, completed: t?.completedCount ?? 0, percentage: t?.completionPercentage ?? 0 },
        checkIn: ci?.status ?? 'NONE',
        streak: st?.currentStreak ?? 0,
        longestStreak: st?.longestStreak ?? 0,
        trend: dateRange(addDays(today, -6), today).map((date) => {
          const d = byDate.get(date);
          return { date, score: d?.dailyScore ?? 0, band: dayBand(d) };
        }),
        topBlocker: top ? { reason: top[0], label: blockerLabel(top[0]), count: top[1] } : null,
        lastActiveAt: c.lastActiveAt,
      });
    }
    return out;
  }

  // ── Mentor board ────────────────────────────────────────────────────

  async board(mentor: AuthUser, now = new Date()) {
    const mentorToday = todayIn(mentor.timezone, now);
    const assignments = await this.prisma.mentorAssignment.findMany({
      where: { mentorId: mentor.id, status: { in: ['ACTIVE', 'PENDING'] }, client: { isActive: true } },
      include: { client: true },
    });
    const active = assignments.filter((a) => a.status === 'ACTIVE');
    const clients = active.map((a) => a.client);
    const ids = clients.map((c) => c.id);
    const [snaps, reviews, lastSession, lastNudge, lastNote, openActions, nextSessions] = await Promise.all([
      this.snapshots(clients, now),
      this.prisma.mentorReview.findMany({ where: { mentorId: mentor.id, date: toDbDate(mentorToday), clientId: { in: ids } }, select: { clientId: true } }),
      this.prisma.mentorSession.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, status: 'DONE' }, _max: { startsAt: true } }),
      this.prisma.nudge.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, mentorId: { not: null }, ruleId: null }, _max: { sentAt: true } }),
      this.prisma.mentorNote.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, archivedAt: null }, _max: { createdAt: true } }),
      this.prisma.actionItem.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, status: 'OPEN' }, _count: { _all: true } }),
      this.prisma.mentorSession.findMany({ where: { clientId: { in: ids }, mentorId: mentor.id, status: 'SCHEDULED', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' } }),
    ]);
    const reviewed = new Set(reviews.map((r) => r.clientId));

    const rows = active.map((a) => {
      const c = a.client;
      const s = snaps.get(c.id)!;
      const contacts = [
        lastSession.find((x) => x.clientId === c.id)?._max.startsAt,
        lastNudge.find((x) => x.clientId === c.id)?._max.sentAt,
        lastNote.find((x) => x.clientId === c.id)?._max.createdAt,
      ].filter((d): d is Date => !!d);
      const lastContactAt = contacts.length ? new Date(Math.max(...contacts.map((d) => d.getTime()))) : null;
      const since = lastContactAt ?? a.acceptedAt ?? a.createdAt;
      return {
        id: c.id,
        name: c.name,
        timezone: c.timezone,
        status: s.status,
        reasons: s.reasons,
        today: s.todayDay,
        checkIn: s.checkIn,
        streak: s.streak,
        trend: s.trend,
        topBlocker: s.topBlocker,
        lastActiveAt: s.lastActiveAt,
        reviewedToday: reviewed.has(c.id),
        lastContactAt,
        noContactFlag: now.getTime() - since.getTime() >= NO_CONTACT_FLAG_DAYS * 86_400_000,
        openActions: openActions.find((x) => x.clientId === c.id)?._count._all ?? 0,
        nextSessionAt: nextSessions.find((x) => x.clientId === c.id)?.startsAt ?? null,
      };
    });
    rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
    const counts = { NEEDS_ATTENTION: 0, WATCH: 0, ON_TRACK: 0, INACTIVE: 0 } as Record<ClientStatus, number>;
    for (const r of rows) counts[r.status]++;

    return {
      date: mentorToday,
      total: rows.length,
      reviewed: rows.filter((r) => r.reviewedToday).length,
      counts,
      clients: rows,
      // A pending client is only a name: nothing is shared until they accept.
      pending: assignments.filter((a) => a.status === 'PENDING').map((a) => ({ assignmentId: a.id, clientId: a.clientId, name: a.client.name, requestedAt: a.createdAt })),
    };
  }

  async markReviewed(mentor: AuthUser, clientId: string, reviewed: boolean, now = new Date()) {
    await this.access.client(mentor, clientId);
    const date = toDbDate(todayIn(mentor.timezone, now));
    if (reviewed) {
      await this.prisma.mentorReview.createMany({ data: [{ mentorId: mentor.id, clientId, date }], skipDuplicates: true });
      await this.audit.record({ userId: clientId, actorId: mentor.id, action: 'CLIENT_REVIEWED', entityType: 'User', entityId: clientId });
    } else {
      await this.prisma.mentorReview.deleteMany({ where: { mentorId: mentor.id, clientId, date } });
    }
    return { clientId, reviewedToday: reviewed };
  }

  // ── Client page ─────────────────────────────────────────────────────

  async overview(actor: AuthUser, clientId: string, now = new Date()) {
    const { client, assignment } = await this.access.client(actor, clientId);
    await this.recordView(actor, clientId, now);
    const subject = asSubject(client);
    const today = todayIn(client.timezone, now);
    const since = addDays(today, -13);

    const [snaps, goal, days, missed, checkIns, evidence, mentor, reviewed] = await Promise.all([
      this.snapshots([client], now),
      this.prisma.goal.findFirst({ where: { userId: client.id, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.dailyAccountability.findMany({ where: { userId: client.id, date: { gte: toDbDate(since), lte: toDbDate(today) } } }),
      this.prisma.taskOccurrence.findMany({
        where: { userId: client.id, period: 'DAY', status: { in: ['MISSED', 'PARTIAL'] }, scheduledDate: { gte: toDbDate(since), lt: toDbDate(today) } },
        orderBy: { scheduledDate: 'desc' },
        select: { id: true, title: true, status: true, completionPercentage: true, scheduledDate: true },
        take: 40,
      }),
      this.prisma.checkIn.findMany({ where: { userId: client.id, date: { gte: toDbDate(since) } }, orderBy: { date: 'desc' } }),
      this.prisma.evidence.findMany({ where: { userId: client.id, deletedAt: null }, orderBy: { submittedAt: 'desc' }, take: 12, include: { occurrence: { select: { title: true, scheduledDate: true } } } }),
      assignment ? this.prisma.user.findUnique({ where: { id: assignment.mentorId }, select: { id: true, name: true } }) : null,
      actor.role === 'MENTOR' ? this.prisma.mentorReview.findFirst({ where: { mentorId: actor.id, clientId, date: toDbDate(todayIn(actor.timezone, now)) } }) : null,
    ]);
    const s = snaps.get(client.id)!;
    const byDate = new Map(days.map((d) => [fromDbDate(d.date), d]));
    const ciByDate = new Map(checkIns.map((c) => [fromDbDate(c.date), c]));
    const goalView = goal ? await this.analytics.goal(subject, goal.id) : null;

    return {
      client: {
        id: client.id,
        name: client.name,
        timezone: client.timezone,
        memberSince: client.createdAt,
        lastActiveAt: client.lastActiveAt,
        isActive: client.isActive,
        mentor: mentor && assignment ? { id: mentor.id, name: mentor.name, since: assignment.acceptedAt ?? assignment.createdAt } : null,
        whatsapp: client.mentorWhatsappOptIn && client.phone ? { available: true, phone: client.phone } : { available: false, phone: null },
      },
      status: s.status,
      reasons: s.reasons,
      today: s.todayDay,
      checkInToday: s.checkIn,
      streak: { current: s.streak, longest: s.longestStreak },
      topBlocker: s.topBlocker,
      reviewedToday: !!reviewed,
      goal: goalView,
      strip: dateRange(since, today).map((d) => presentDay(d, byDate.get(d), today)),
      missed: missed.map((o) => {
        const date = fromDbDate(o.scheduledDate);
        const ci = ciByDate.get(date);
        return { id: o.id, date, title: o.title, status: o.status, completionPercentage: o.completionPercentage, blockers: (ci?.blockers ?? []).map(blockerLabel), blockerNote: ci?.blocker ?? null };
      }),
      checkIns: checkIns
        .filter((c) => c.status === 'COMPLETED' || c.status === 'LATE' || c.status === 'MISSED')
        .map((c) => ({
          date: fromDbDate(c.date),
          status: c.status,
          completionPercentage: c.completionPercentage,
          confidence: c.confidence,
          mood: c.mood,
          blockers: c.blockers.map(blockerLabel),
          reflection: c.reflectionPrivate ? null : c.reflection,
          reflectionPrivate: c.reflectionPrivate,
        })),
      evidence: await Promise.all(
        evidence.map(async (e) => ({ ...(await this.evidence.present(e)), taskTitle: e.occurrence.title, date: fromDbDate(e.occurrence.scheduledDate) })),
      ),
    };
  }

  async day(actor: AuthUser, clientId: string, date: string) {
    if (!isValidLocalDate(date)) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD');
    const { client } = await this.access.client(actor, clientId);
    const d = await this.analytics.day(asSubject(client), date);
    return { ...d, checkIn: redactCheckIn(d.checkIn) };
  }

  async week(actor: AuthUser, clientId: string, date?: string) {
    const { client } = await this.access.client(actor, clientId);
    return this.analytics.week(asSubject(client), date);
  }

  /** WhatsApp click-to-chat link with a pre-typed message; only after the client opted in. */
  async whatsapp(actor: AuthUser, clientId: string, text: string) {
    const { client } = await this.access.assignedMentor(actor, clientId);
    if (!client.mentorWhatsappOptIn || !client.phone) return { available: false, url: null };
    return { available: true, url: whatsappLink(client.phone, text) };
  }

  // ── Timeline ────────────────────────────────────────────────────────

  async timeline(actor: AuthUser, clientId: string, opts: { before?: string; limit?: number } = {}) {
    const { client } = await this.access.client(actor, clientId);
    const before = opts.before ? new Date(opts.before) : new Date(Date.now() + 365 * 86_400_000);
    if (Number.isNaN(before.getTime())) throw badRequest('INVALID_CURSOR', 'before must be an ISO timestamp');
    const take = Math.min(Math.max(opts.limit ?? 40, 1), 100);
    const id = client.id;

    const [checkIns, missed, evidence, nudges, sessions, notes, actions, assignments] = await Promise.all([
      this.prisma.checkIn.findMany({ where: { userId: id, status: { not: 'PENDING' }, updatedAt: { lt: before } }, orderBy: { updatedAt: 'desc' }, take }),
      this.prisma.taskOccurrence.findMany({ where: { userId: id, status: 'MISSED', missedAt: { lt: before, not: null } }, orderBy: { missedAt: 'desc' }, take, select: { id: true, title: true, missedAt: true, scheduledDate: true } }),
      this.prisma.evidence.findMany({ where: { userId: id, deletedAt: null, submittedAt: { lt: before } }, orderBy: { submittedAt: 'desc' }, take, include: { occurrence: { select: { title: true } } } }),
      this.prisma.nudge.findMany({ where: { clientId: id, sentAt: { lt: before } }, orderBy: { sentAt: 'desc' }, take }),
      this.prisma.mentorSession.findMany({ where: { clientId: id, startsAt: { lt: before } }, orderBy: { startsAt: 'desc' }, take }),
      this.prisma.mentorNote.findMany({ where: { clientId: id, archivedAt: null, isDraft: false, createdAt: { lt: before } }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.actionItem.findMany({ where: { clientId: id, createdAt: { lt: before } }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.mentorAssignment.findMany({ where: { clientId: id }, include: { mentor: { select: { name: true } } } }),
    ]);
    const authorIds = [...new Set([...notes.map((n) => n.authorId), ...nudges.map((n) => n.mentorId).filter((x): x is string => !!x)])];
    const authors = new Map((await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

    type Ev = { id: string; type: string; at: Date; title: string; detail?: string | null; tone?: 'good' | 'bad' | 'neutral' };
    const events: Ev[] = [];
    for (const c of checkIns) {
      if (c.status === 'MISSED') events.push({ id: `ci:${c.id}`, type: 'CHECKIN_MISSED', at: c.updatedAt, title: `Missed check-in (${fromDbDate(c.date)})`, tone: 'bad' });
      else
        events.push({
          id: `ci:${c.id}`,
          type: 'CHECKIN',
          at: c.completedAt ?? c.updatedAt,
          title: `Checked in${c.status === 'LATE' ? ' late' : ''} · ${c.completionPercentage}% · confidence ${c.confidence ?? '–'}/5`,
          detail: c.reflectionPrivate ? 'Reflection kept private' : c.reflection,
          tone: c.completionPercentage >= 80 ? 'good' : 'neutral',
        });
    }
    for (const o of missed) events.push({ id: `occ:${o.id}`, type: 'TASK_MISSED', at: o.missedAt!, title: `Missed: ${o.title}`, detail: fromDbDate(o.scheduledDate), tone: 'bad' });
    for (const e of evidence) events.push({ id: `ev:${e.id}`, type: 'EVIDENCE', at: e.submittedAt, title: `Evidence for ${e.occurrence.title}`, detail: e.description, tone: 'good' });
    for (const n of nudges)
      events.push({
        id: `nu:${n.id}`,
        type: 'NUDGE',
        at: n.sentAt,
        title: `${n.ruleId ? 'Automatic nudge' : `Nudge from ${authors.get(n.mentorId ?? '') ?? 'mentor'}`}${n.respondedAt ? ' · client responded' : ''}`,
        detail: n.body,
      });
    for (const s of sessions) events.push({ id: `se:${s.id}`, type: 'SESSION', at: s.startsAt, title: `Session (${s.channel.replace('_', ' ').toLowerCase()}) · ${s.status.replace('_', ' ').toLowerCase()}`, tone: s.status === 'DONE' ? 'good' : s.status === 'NO_SHOW' ? 'bad' : 'neutral' });
    for (const n of notes) events.push({ id: `no:${n.id}`, type: 'NOTE', at: n.createdAt, title: `${n.kind === 'SESSION' ? 'Session note' : 'Quick note'} by ${authors.get(n.authorId) ?? 'mentor'}`, detail: n.text.slice(0, 200) });
    for (const a of actions) {
      events.push({ id: `ac:${a.id}`, type: 'ACTION', at: a.createdAt, title: `Action for ${a.owner === 'CLIENT' ? 'client' : 'mentor'}: ${a.title}` });
      if (a.doneAt && a.doneAt < before) events.push({ id: `ad:${a.id}`, type: 'ACTION_DONE', at: a.doneAt, title: `Done: ${a.title}`, tone: 'good' });
    }
    for (const a of assignments) {
      if (a.createdAt < before) events.push({ id: `as:${a.id}`, type: 'ASSIGNMENT', at: a.createdAt, title: `Assigned to ${a.mentor.name}` });
      if (a.acceptedAt && a.acceptedAt < before) events.push({ id: `aa:${a.id}`, type: 'ASSIGNMENT', at: a.acceptedAt, title: `Accepted ${a.mentor.name} as mentor`, tone: 'good' });
      if (a.endedAt && a.endedAt < before) events.push({ id: `ae:${a.id}`, type: 'ASSIGNMENT', at: a.endedAt, title: `Mentoring with ${a.mentor.name} ended (${(a.endReason ?? '').replace('_', ' ').toLowerCase()})` });
    }
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    const page = events.slice(0, take);
    return { items: page, nextBefore: events.length > take ? page[page.length - 1].at.toISOString() : null };
  }

  // ── My day ──────────────────────────────────────────────────────────

  async myDay(mentor: AuthUser, now = new Date()) {
    const today = todayIn(mentor.timezone, now);
    const clientIds = await this.access.activeClientIds(mentor.id);
    const [sessions, followUps, overdueClient, reviews, alerts, clients] = await Promise.all([
      this.prisma.mentorSession.findMany({
        where: { mentorId: mentor.id, status: { in: ['SCHEDULED', 'DONE', 'NO_SHOW'] }, startsAt: { gte: startOfLocalDay(today, mentor.timezone), lt: endOfLocalDay(today, mentor.timezone) }, clientId: { in: clientIds } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.actionItem.findMany({ where: { mentorId: mentor.id, owner: 'MENTOR', status: 'OPEN', dueDate: { lte: toDbDate(today) }, clientId: { in: clientIds } }, orderBy: { dueDate: 'asc' } }),
      this.prisma.actionItem.findMany({ where: { owner: 'CLIENT', status: 'OPEN', dueDate: { lt: toDbDate(today) }, clientId: { in: clientIds } }, orderBy: { dueDate: 'asc' } }),
      this.prisma.mentorReview.findMany({ where: { mentorId: mentor.id, date: toDbDate(today) }, select: { clientId: true } }),
      this.prisma.notification.findMany({ where: { userId: mentor.id, type: 'MENTOR_ALERT', readAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
    ]);
    const name = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Client';
    const reviewed = new Set(reviews.map((r) => r.clientId));
    return {
      date: today,
      sessions: sessions.map((s) => ({ id: s.id, clientId: s.clientId, clientName: name(s.clientId), startsAt: s.startsAt, durationMin: s.durationMin, channel: s.channel, link: s.link, status: s.status })),
      followUps: followUps.map((a) => ({ id: a.id, clientId: a.clientId, clientName: name(a.clientId), title: a.title, dueDate: a.dueDate && fromDbDate(a.dueDate), overdue: !!a.dueDate && fromDbDate(a.dueDate) < today })),
      overdueClientActions: overdueClient.map((a) => ({ id: a.id, clientId: a.clientId, clientName: name(a.clientId), title: a.title, dueDate: a.dueDate && fromDbDate(a.dueDate) })),
      notReviewed: clients.filter((c) => !reviewed.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
      alerts: alerts.map((a) => ({ id: a.id, title: a.title, body: a.body, link: a.link, clientId: a.subjectId, createdAt: a.createdAt })),
    };
  }

  /** "Who looked at my data?": the first view of a client by each mentor/admin per day is audited. */
  private async recordView(actor: AuthUser, clientId: string, now: Date) {
    const dayStart = startOfLocalDay(todayIn(actor.timezone, now), actor.timezone);
    const seen = await this.prisma.auditLog.findFirst({ where: { actorId: actor.id, userId: clientId, action: 'CLIENT_VIEWED', createdAt: { gte: dayStart } }, select: { id: true } });
    if (!seen) await this.audit.record({ userId: clientId, actorId: actor.id, action: 'CLIENT_VIEWED', entityType: 'User', entityId: clientId });
  }
}
