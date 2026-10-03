import { Injectable } from '@nestjs/common';
import { MentorSession, Prisma, SessionChannel, SessionStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { PrismaService, Tx } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { badRequest, notFound } from '../common/errors/app-error';
import { MentorAccessService } from './mentor-access.service';

export const REMINDER_LEADS = [5, 15, 60] as const;
export const MAX_REPEAT_WEEKS = 12;

export interface AgendaItem {
  id: string;
  text: string;
  done: boolean;
}

export const formatLocal = (d: Date, tz: string) => DateTime.fromJSDate(d).setZone(tz).toFormat('ccc d LLL, HH:mm');

export function presentSession(s: MentorSession & { client?: { name: string } | null; mentor?: { name: string } | null }, opts: { hasNote?: boolean } = {}) {
  return {
    id: s.id,
    clientId: s.clientId,
    clientName: s.client?.name,
    mentorId: s.mentorId,
    mentorName: s.mentor?.name,
    startsAt: s.startsAt,
    endsAt: new Date(s.startsAt.getTime() + s.durationMin * 60_000),
    durationMin: s.durationMin,
    channel: s.channel,
    link: s.link,
    status: s.status,
    agenda: (s.agenda as unknown as AgendaItem[]) ?? [],
    seriesId: s.seriesId,
    reminderLeadMin: s.reminderLeadMin,
    hasNote: opts.hasNote,
  };
}

/**
 * Calls between a mentor and a client. Reminder jobs are keyed by (session, start time, lead, recipient),
 * so they are created once; when a session moves, the new time gets new jobs and the handler ignores the old ones.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly queue: JobQueueService,
  ) {}

  async listForMentor(mentor: AuthUser, range: { from?: string; to?: string; clientId?: string }) {
    const from = range.from ? new Date(range.from) : new Date(Date.now() - 7 * 86_400_000);
    const to = range.to ? new Date(range.to) : new Date(Date.now() + 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest('INVALID_RANGE', 'from/to must be ISO timestamps');
    let clientFilter: Prisma.MentorSessionWhereInput = {};
    if (range.clientId) {
      await this.access.client(mentor, range.clientId);
      clientFilter = { clientId: range.clientId };
    } else if (mentor.role !== 'ADMIN') {
      clientFilter = { mentorId: mentor.id, clientId: { in: await this.access.activeClientIds(mentor.id) } };
    }
    const rows = await this.prisma.mentorSession.findMany({
      where: { ...clientFilter, startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: 'asc' },
      take: 300,
    });
    const [names, notes] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.clientId, r.mentorId]))] } }, select: { id: true, name: true } }),
      this.prisma.mentorNote.findMany({ where: { sessionId: { in: rows.map((r) => r.id) } }, select: { sessionId: true } }),
    ]);
    const nameOf = (id: string) => ({ name: names.find((n) => n.id === id)?.name ?? 'Unknown' });
    const withNote = new Set(notes.map((n) => n.sessionId));
    return rows.map((r) => presentSession({ ...r, client: nameOf(r.clientId), mentor: nameOf(r.mentorId) }, { hasNote: withNote.has(r.id) }));
  }

  async get(actor: AuthUser, id: string) {
    const s = await this.prisma.mentorSession.findUnique({ where: { id } });
    if (!s) throw notFound('Session');
    const { client } = await this.access.client(actor, s.clientId);
    const note = await this.prisma.mentorNote.findUnique({ where: { sessionId: s.id }, select: { id: true } });
    return { ...presentSession({ ...s, client: { name: client.name } }, { hasNote: !!note }), noteId: note?.id ?? null, clientTimezone: client.timezone };
  }

  async create(
    mentor: AuthUser,
    input: { clientId: string; startsAt: string; durationMin?: number; channel?: SessionChannel; link?: string | null; repeatWeeks?: number; reminderLeadMin?: number },
    now = new Date(),
  ) {
    const { client, assignment } = await this.access.assignedMentor(mentor, input.clientId);
    const start = new Date(input.startsAt);
    if (Number.isNaN(start.getTime())) throw badRequest('INVALID_TIME', 'startsAt must be an ISO timestamp');
    if (start.getTime() < now.getTime() - 60_000) throw badRequest('SESSION_IN_PAST', 'Pick a time in the future.');
    const repeat = Math.min(Math.max(input.repeatWeeks ?? 0, 0), MAX_REPEAT_WEEKS);
    const seriesId = repeat > 0 ? randomUUID() : null;
    const lead = input.reminderLeadMin ?? 5;

    const created = await this.prisma.tx(async (tx) => {
      const out: MentorSession[] = [];
      for (let i = 0; i <= repeat; i++) {
        // Weekly repeats keep the same local wall-clock time across DST changes (in the mentor's timezone).
        const startsAt = DateTime.fromJSDate(start).setZone(mentor.timezone).plus({ weeks: i }).toJSDate();
        const s = await tx.mentorSession.create({
          data: {
            mentorId: mentor.id,
            clientId: client.id,
            assignmentId: assignment.id,
            startsAt,
            durationMin: input.durationMin ?? 30,
            channel: input.channel ?? 'WHATSAPP',
            link: input.link?.trim() || null,
            seriesId,
            reminderLeadMin: lead,
          },
        });
        await this.scheduleReminders(tx, s, now);
        out.push(s);
      }
      await this.audit.record({ userId: client.id, actorId: mentor.id, action: 'SESSION_BOOKED', entityType: 'MentorSession', entityId: out[0].id, metadata: { count: out.length, startsAt: out[0].startsAt.toISOString() } }, tx);
      await this.notifications.createOnce(tx, {
        userId: client.id,
        type: 'SESSION_REMINDER',
        dedupeKey: `SESSION_BOOKED:${out[0].id}`,
        title: `${mentor.name} booked a call with you`,
        body: `${formatLocal(out[0].startsAt, client.timezone)}${out.length > 1 ? `, then weekly (${out.length} sessions)` : ''}.`,
        scheduledAt: now,
        link: '/app/dashboard#sessions',
      });
      return out;
    });
    return created.map((s) => presentSession({ ...s, client: { name: client.name } }));
  }

  async update(
    actor: AuthUser,
    id: string,
    input: { startsAt?: string; durationMin?: number; channel?: SessionChannel; link?: string | null; status?: SessionStatus; agenda?: AgendaItem[]; reminderLeadMin?: number },
    now = new Date(),
  ) {
    const s = await this.prisma.mentorSession.findUnique({ where: { id } });
    if (!s) throw notFound('Session');
    const { client } = await this.access.assignedMentor(actor, s.clientId);
    const startsAt = input.startsAt ? new Date(input.startsAt) : s.startsAt;
    if (Number.isNaN(startsAt.getTime())) throw badRequest('INVALID_TIME', 'startsAt must be an ISO timestamp');
    const moved = startsAt.getTime() !== s.startsAt.getTime();
    if (moved && startsAt.getTime() < now.getTime() - 60_000) throw badRequest('SESSION_IN_PAST', 'Pick a time in the future.');
    if (moved && s.status !== 'SCHEDULED') throw badRequest('SESSION_CLOSED', 'Only a scheduled session can be moved.');

    const updated = await this.prisma.tx(async (tx) => {
      const u = await tx.mentorSession.update({
        where: { id },
        data: {
          startsAt,
          durationMin: input.durationMin ?? s.durationMin,
          channel: input.channel ?? s.channel,
          link: input.link === undefined ? s.link : input.link?.trim() || null,
          status: input.status ?? s.status,
          agenda: input.agenda ? (input.agenda.slice(0, 30) as unknown as Prisma.InputJsonValue) : (s.agenda as Prisma.InputJsonValue),
          reminderLeadMin: input.reminderLeadMin ?? s.reminderLeadMin,
        },
      });
      if (u.status === 'SCHEDULED' && (moved || u.reminderLeadMin !== s.reminderLeadMin)) await this.scheduleReminders(tx, u, now);
      if (moved || (input.status && input.status !== s.status)) {
        await this.audit.record({ userId: s.clientId, actorId: actor.id, action: 'SESSION_CHANGED', entityType: 'MentorSession', entityId: id, metadata: { status: u.status, moved } }, tx);
      }
      if (u.status === 'CANCELLED' && s.status !== 'CANCELLED') {
        await this.notifications.createOnce(tx, {
          userId: s.clientId,
          type: 'SESSION_REMINDER',
          dedupeKey: `SESSION_CANCELLED:${id}`,
          title: `${actor.name} cancelled your call`,
          body: `The call on ${formatLocal(s.startsAt, client.timezone)} won’t happen.`,
          scheduledAt: now,
          link: '/app/dashboard#sessions',
        });
      } else if (moved && u.status === 'SCHEDULED') {
        await this.notifications.createOnce(tx, {
          userId: s.clientId,
          type: 'SESSION_REMINDER',
          dedupeKey: `SESSION_MOVED:${id}:${startsAt.getTime()}`,
          title: `${actor.name} moved your call`,
          body: `New time: ${formatLocal(startsAt, client.timezone)}.`,
          scheduledAt: now,
          link: '/app/dashboard#sessions',
        });
      }
      return u;
    });
    return presentSession({ ...updated, client: { name: client.name } });
  }

  // ── Client side ─────────────────────────────────────────────────────

  async mine(user: AuthUser, now = new Date()) {
    const rows = await this.prisma.mentorSession.findMany({
      where: { clientId: user.id, status: 'SCHEDULED', startsAt: { gte: new Date(now.getTime() - 2 * 60 * 60_000) } },
      orderBy: { startsAt: 'asc' },
      take: 10,
    });
    const active = await this.prisma.mentorAssignment.findFirst({ where: { clientId: user.id, status: 'ACTIVE' }, include: { mentor: { select: { name: true } } } });
    return rows
      .filter((r) => r.assignmentId === active?.id)
      .map((r) => {
        const p = presentSession({ ...r, mentor: active?.mentor ?? null });
        // The client sees when and how, never the mentor's agenda.
        return { id: p.id, mentorName: p.mentorName, startsAt: p.startsAt, endsAt: p.endsAt, durationMin: p.durationMin, channel: p.channel, link: p.link, status: p.status };
      });
  }

  // ── Reminders ───────────────────────────────────────────────────────

  async scheduleReminders(db: Tx | PrismaService, s: MentorSession, now = new Date()) {
    if (s.status !== 'SCHEDULED' || s.startsAt <= now) return 0;
    const runAt = new Date(Math.max(now.getTime(), s.startsAt.getTime() - s.reminderLeadMin * 60_000));
    return this.queue.enqueueMany(
      (['mentor', 'client'] as const).map((who) => ({
        name: 'session-reminder',
        payload: { sessionId: s.id, startsAt: s.startsAt.getTime(), lead: s.reminderLeadMin, who },
        opts: { runAt, dedupeKey: `session-reminder:${s.id}:${s.startsAt.getTime()}:${s.reminderLeadMin}:${who}`, maxAttempts: 3 },
      })),
      db,
    );
  }

  /** Job handler. A no-op unless the session is still scheduled at the same time and the link is still active. */
  async sendReminder(payload: { sessionId: string; startsAt: number; lead: number; who: 'mentor' | 'client' }, now = new Date()) {
    const s = await this.prisma.mentorSession.findUnique({ where: { id: payload.sessionId } });
    if (!s || s.status !== 'SCHEDULED' || s.startsAt.getTime() !== payload.startsAt || s.reminderLeadMin !== payload.lead) return { sent: false, reason: 'stale' };
    if (s.startsAt.getTime() + s.durationMin * 60_000 < now.getTime()) return { sent: false, reason: 'over' };
    const assignment = await this.prisma.mentorAssignment.findFirst({ where: { id: s.assignmentId, status: 'ACTIVE' } });
    if (!assignment) return { sent: false, reason: 'ended' };
    const [mentor, client] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: s.mentorId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: s.clientId } }),
    ]);
    const minutes = Math.max(0, Math.round((s.startsAt.getTime() - now.getTime()) / 60_000));
    const when = minutes <= 1 ? 'now' : `in ${minutes} minutes`;
    const toMentor = payload.who === 'mentor';
    const created = await this.notifications.createOnce(this.prisma, {
      userId: toMentor ? mentor.id : client.id,
      type: 'SESSION_REMINDER',
      dedupeKey: `SESSION_REMINDER:${s.id}:${s.startsAt.getTime()}:${payload.who}`,
      title: toMentor ? `Call with ${client.name} ${when}` : `Your call with ${mentor.name} starts ${when}`,
      body: toMentor ? 'Open the prep sheet to see what to talk about.' : `${s.channel === 'WHATSAPP' ? 'On WhatsApp' : s.channel === 'VIDEO' ? 'Video call' : s.channel === 'PHONE' ? 'Phone call' : 'In person'}${s.link ? ` · ${s.link}` : ''}.`,
      scheduledAt: now,
      link: toMentor ? `/mentor/prep?sessionId=${s.id}` : '/app/dashboard#sessions',
      subjectId: toMentor ? client.id : undefined,
    });
    return { sent: created };
  }
}
