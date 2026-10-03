import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { addDays, endOfLocalDay, fromDbDate, startOfLocalDay, todayIn, toDbDate } from '../domain/dates';
import { ClientInsightsService, asSubject } from './client-insights.service';
import { NudgesService } from './nudges.service';
import { ReportsService } from './reports.service';

/** Mentor-facing notifications are only sent in the mentor's daytime. */
const MENTOR_DAY_START = '07:00';
const MENTOR_DAY_END = '22:00';
const SUMMARY_FROM = '08:00';
const SUMMARY_UNTIL = '12:00';

const hhmm = (tz: string, now: Date) => DateTime.fromJSDate(now).setZone(tz).toFormat('HH:mm');

/**
 * Mentoring work that rides on the existing 15-minute per-user maintenance job:
 *  - clients with an active mentor: nudge responses, nudge rules, Monday weekly report, alerts to the mentor
 *  - mentors: the morning summary and follow-up reminders on due dates
 * Every step is idempotent (unique dedupe keys), so retries and overlapping runs are safe.
 */
@Injectable()
export class MentoringJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly insights: ClientInsightsService,
    private readonly nudges: NudgesService,
    private readonly reports: ReportsService,
  ) {}

  async runForUser(userId: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return { skipped: true };
    if (user.role === 'MENTOR') return this.forMentor(user, now);
    if (user.role === 'USER') return this.forClient(user, now);
    return { skipped: true };
  }

  async forClient(client: User, now = new Date()) {
    const assignment = await this.prisma.mentorAssignment.findFirst({ where: { clientId: client.id, status: 'ACTIVE' }, include: { mentor: true } });
    if (!assignment || !assignment.mentor.isActive) return { mentored: false };
    const responses = await this.nudges.markResponses(client.id, now);
    const rules = await this.nudges.evaluateRules(client.id, now);
    const report = await this.reports.ensureLastWeek(client.id, now);
    const alerted = await this.alert(client, assignment.mentor, now);
    return { mentored: true, responses: responses.marked, rulesFired: rules.fired, report: !!report, alerted };
  }

  /** One alert per client per client-local day, combining every reason that applies. */
  async alert(client: User, mentor: User, now = new Date()) {
    const t = hhmm(mentor.timezone, now);
    if (t < MENTOR_DAY_START || t >= MENTOR_DAY_END) return false;
    const today = todayIn(client.timezone, now);
    const snap = (await this.insights.snapshots([client], now)).get(client.id)!;
    const reasons: string[] = [];
    if (snap.status === 'NEEDS_ATTENTION') reasons.push(...snap.reasons);

    const days = await this.prisma.dailyAccountability.findMany({
      where: { userId: client.id, date: { gte: toDbDate(addDays(today, -10)), lt: toDbDate(today) }, isFinal: true },
      orderBy: { date: 'desc' },
    });
    const working = days.filter((d) => d.plannedCount > 0 && !d.isRestDay);
    const [y, before] = working;
    if (y && fromDbDate(y.date) === addDays(today, -1) && !y.isSuccessful && before && before.streakDay >= 7) reasons.push(`Broke a ${before.streakDay}-day streak`);
    if (working.length >= 2 && !working[0].checkInCompleted && !working[1].checkInCompleted && fromDbDate(working[0].date) === addDays(today, -1)) {
      reasons.push('Missed 2 check-ins in a row');
    }
    const latest = await this.prisma.checkIn.findFirst({
      where: { userId: client.id, date: { gte: toDbDate(addDays(today, -1)) }, status: { in: ['COMPLETED', 'LATE'] }, confidence: { not: null } },
      orderBy: { date: 'desc' },
    });
    if (latest?.confidence && latest.confidence <= 2) reasons.push(`Confidence ${latest.confidence}/5 in the latest check-in`);
    if (reasons.length === 0) return false;

    return this.notifications.createOnce(this.prisma, {
      userId: mentor.id,
      type: 'MENTOR_ALERT',
      dedupeKey: `ALERT:${client.id}:${today}`,
      title: `${client.name} needs attention`,
      body: [...new Set(reasons)].join(' · '),
      scheduledAt: now,
      link: `/mentor/clients/detail?id=${client.id}`,
      subjectId: client.id,
    });
  }

  async forMentor(mentor: User, now = new Date()) {
    const t = hhmm(mentor.timezone, now);
    if (t < MENTOR_DAY_START || t >= MENTOR_DAY_END) return { mentor: true, summary: false, followUps: 0 };
    const today = todayIn(mentor.timezone, now);
    let summary = false;

    if (t >= SUMMARY_FROM && t < SUMMARY_UNTIL) {
      const board = await this.insights.board(asSubject(mentor), now);
      if (board.total > 0) {
        const attention = board.clients.filter((c) => c.status === 'NEEDS_ATTENTION');
        const calls = await this.prisma.mentorSession.count({
          where: { mentorId: mentor.id, status: 'SCHEDULED', startsAt: { gte: startOfLocalDay(today, mentor.timezone), lt: endOfLocalDay(today, mentor.timezone) } },
        });
        const names = attention.slice(0, 4).map((c) => c.name.split(' ')[0]).join(', ') + (attention.length > 4 ? ` and ${attention.length - 4} more` : '');
        summary = await this.notifications.createOnce(this.prisma, {
          userId: mentor.id,
          type: 'MENTOR_SUMMARY',
          dedupeKey: `MENTOR_SUMMARY:${today}`,
          title: attention.length ? `${attention.length} of ${board.total} clients need attention` : `All ${board.total} clients are on track or watching`,
          body: `${attention.length ? `${names}. ` : ''}${calls ? `${calls} call${calls === 1 ? '' : 's'} today.` : 'No calls today.'}${board.pending.length ? ` ${board.pending.length} waiting to accept.` : ''}`,
          scheduledAt: now,
          link: '/mentor',
        });
      }
    }

    const due = await this.prisma.actionItem.findMany({
      where: { mentorId: mentor.id, owner: 'MENTOR', status: 'OPEN', dueDate: { lte: toDbDate(today) } },
      take: 50,
    });
    let followUps = 0;
    if (due.length) {
      const active = new Set(
        (await this.prisma.mentorAssignment.findMany({ where: { mentorId: mentor.id, status: 'ACTIVE', clientId: { in: due.map((d) => d.clientId) } }, select: { clientId: true } })).map((a) => a.clientId),
      );
      const names = new Map((await this.prisma.user.findMany({ where: { id: { in: due.map((d) => d.clientId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      for (const a of due.filter((d) => active.has(d.clientId))) {
        const created = await this.notifications.createOnce(this.prisma, {
          userId: mentor.id,
          type: 'FOLLOW_UP_DUE',
          dedupeKey: `FOLLOW_UP:${a.id}:${fromDbDate(a.dueDate!)}`,
          title: `Follow up with ${names.get(a.clientId) ?? 'your client'}`,
          body: a.title,
          scheduledAt: now,
          link: `/mentor/clients/detail?id=${a.clientId}&tab=actions`,
          subjectId: a.clientId,
        });
        if (created) followUps++;
      }
    }
    return { mentor: true, summary, followUps };
  }
}
