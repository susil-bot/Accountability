import { Injectable } from '@nestjs/common';
import { DailyAccountability } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import {
  addDays, dateRange, endOfWeek, fromDbDate, isValidLocalDate, LocalDate, startOfWeek, todayIn, toDbDate,
} from '../domain/dates';
import { dayBand, weeklyScore } from '../domain/scoring';
import { badRequest, notFound } from '../common/errors/app-error';
import { occurrenceInclude, presentOccurrence } from '../tasks/occurrence.presenter';
import { presentCheckIn } from '../checkins/checkins.service';
import { GoalsRepository } from '../goals/goals.repository';
import { presentGoal } from '../goals/goals.presenter';
import { DateTime } from 'luxon';

export function presentDay(date: LocalDate, d: DailyAccountability | undefined, today: LocalDate) {
  return {
    date,
    isFuture: date > today,
    isToday: date === today,
    plannedCount: d?.plannedCount ?? 0,
    completedCount: d?.completedCount ?? 0,
    partialCount: d?.partialCount ?? 0,
    missedCount: d?.missedCount ?? 0,
    completionPercentage: d?.completionPercentage ?? 0,
    dailyScore: d?.dailyScore ?? 0,
    checkInCompleted: d?.checkInCompleted ?? false,
    isRestDay: d?.isRestDay ?? false,
    isSuccessful: d?.isSuccessful ?? false,
    streakDay: d?.streakDay ?? 0,
    band: date > today ? 'FUTURE' : dayBand(d),
  };
}

/** All analytics are deterministic aggregations of stored activity (Rule 9). */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsRepository,
  ) {}

  private async daysBetween(userId: string, from: LocalDate, to: LocalDate) {
    const rows = await this.prisma.dailyAccountability.findMany({
      where: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    });
    return new Map(rows.map((r) => [fromDbDate(r.date), r]));
  }

  async week(user: AuthUser, anchor?: string) {
    const today = todayIn(user.timezone);
    if (anchor && !isValidLocalDate(anchor)) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD');
    const start = startOfWeek(anchor ?? today);
    const end = endOfWeek(start);
    const map = await this.daysBetween(user.id, start, end);
    const days = dateRange(start, end).map((d) => presentDay(d, map.get(d), today));
    // Today only counts once it's checked in — an unfinished day shouldn't drag the week down every morning.
    const elapsed = days.filter((d) => !d.isFuture && (!d.isToday || d.checkInCompleted));
    const active = elapsed.filter((d) => d.plannedCount > 0 && !d.isRestDay);

    const occ = await this.prisma.taskOccurrence.findMany({
      where: {
        userId: user.id,
        status: { not: 'SKIPPED' },
        OR: [
          { period: 'DAY', scheduledDate: { gte: toDbDate(start), lte: toDbDate(end < today ? end : today) } },
          { period: 'WEEK', scheduledDate: toDbDate(start) },
        ],
      },
      include: { task: { include: { commitment: { select: { id: true, title: true } } } } },
    });
    const byCommitment = new Map<string, { commitmentId: string; title: string; planned: number; completed: number; missed: number; pctSum: number }>();
    for (const o of occ) {
      const c = o.task.commitment;
      const row = byCommitment.get(c.id) ?? { commitmentId: c.id, title: c.title, planned: 0, completed: 0, missed: 0, pctSum: 0 };
      row.planned += 1;
      row.pctSum += o.completionPercentage;
      if (o.status === 'COMPLETED') row.completed += 1;
      if (o.status === 'MISSED') row.missed += 1;
      byCommitment.set(c.id, row);
    }

    const checkIns = await this.prisma.checkIn.findMany({
      where: { userId: user.id, date: { gte: toDbDate(start), lte: toDbDate(end) } },
      select: { blockers: true, status: true },
    });
    const blockerCounts: Record<string, number> = {};
    for (const c of checkIns) for (const b of c.blockers) blockerCounts[b] = (blockerCounts[b] ?? 0) + 1;

    return {
      weekStart: start,
      weekEnd: end,
      days,
      tasksPlanned: active.reduce((s, d) => s + d.plannedCount, 0),
      tasksCompleted: active.reduce((s, d) => s + d.completedCount, 0),
      completionRate: active.length ? Math.round(active.reduce((s, d) => s + d.completionPercentage, 0) / active.length) : null,
      checkIns: elapsed.filter((d) => d.checkInCompleted).length,
      checkInDays: elapsed.filter((d) => !d.isRestDay && (d.plannedCount > 0 || d.checkInCompleted)).length,
      activeDays: active.length,
      score: weeklyScore(elapsed),
      commitments: [...byCommitment.values()].map((r) => ({
        commitmentId: r.commitmentId,
        title: r.title,
        planned: r.planned,
        completed: r.completed,
        missed: r.missed,
        completionRate: r.planned ? Math.round(r.pctSum / r.planned) : 0,
      })),
      blockers: Object.entries(blockerCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => ({ reason, count })),
    };
  }

  async month(user: AuthUser, month?: string) {
    const today = todayIn(user.timezone);
    const m = month ?? today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw badRequest('INVALID_MONTH', 'month must be YYYY-MM');
    const first = `${m}-01`;
    const last = DateTime.fromISO(first, { zone: 'utc' }).endOf('month').toISODate()!;
    const map = await this.daysBetween(user.id, first, last);
    const days = dateRange(first, last).map((d) => presentDay(d, map.get(d), today));
    const active = days.filter((d) => !d.isFuture && (!d.isToday || d.checkInCompleted) && d.plannedCount > 0 && !d.isRestDay);
    const best = [...active].sort((a, b) => b.dailyScore - a.dailyScore || a.date.localeCompare(b.date))[0] ?? null;
    const worst = [...active].sort((a, b) => a.dailyScore - b.dailyScore || a.date.localeCompare(b.date))[0] ?? null;
    return {
      month: m,
      days,
      activeDays: active.length,
      successfulDays: active.filter((d) => d.isSuccessful).length,
      consistency: active.length ? Math.round((active.filter((d) => d.isSuccessful).length / active.length) * 100) : null,
      averageScore: weeklyScore(active),
      averageCompletion: active.length ? Math.round(active.reduce((s, d) => s + d.completionPercentage, 0) / active.length) : null,
      bestDay: best && { date: best.date, score: best.dailyScore },
      worstDay: worst && { date: worst.date, score: worst.dailyScore },
      previousMonth: DateTime.fromISO(first, { zone: 'utc' }).minus({ months: 1 }).toFormat('yyyy-MM'),
      nextMonth: m >= today.slice(0, 7) ? null : DateTime.fromISO(first, { zone: 'utc' }).plus({ months: 1 }).toFormat('yyyy-MM'),
    };
  }

  /** Calendar drill-down: tasks, completion, check-in, reflection, evidence, score. */
  async day(user: AuthUser, date: string) {
    if (!isValidLocalDate(date)) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD');
    const today = todayIn(user.timezone);
    const [d, checkIn, occ] = await Promise.all([
      this.prisma.dailyAccountability.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(date) } } }),
      this.prisma.checkIn.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(date) } } }),
      this.prisma.taskOccurrence.findMany({
        where: { userId: user.id, scheduledDate: toDbDate(date), period: 'DAY' },
        include: { ...occurrenceInclude, evidence: { where: { deletedAt: null }, select: { id: true, type: true, description: true, url: true, originalName: true, submittedAt: true } } },
        orderBy: { scheduledStartTime: 'asc' },
      }),
    ]);
    return {
      ...presentDay(date, d ?? undefined, today),
      checkIn: checkIn ? presentCheckIn(checkIn) : null,
      tasks: occ.map((o) => ({
        ...presentOccurrence(o),
        evidence: o.evidence.map((e) => ({ id: e.id, type: e.type, description: e.description, url: e.type === 'URL' ? e.url : null, originalName: e.originalName, submittedAt: e.submittedAt })),
      })),
    };
  }

  async goal(user: AuthUser, goalId: string) {
    const today = todayIn(user.timezone);
    const g = await this.prisma.goal.findFirst({ where: { id: goalId, userId: user.id }, include: { commitments: true } });
    if (!g) throw notFound('Goal');
    const since = addDays(today, -29);
    const occ = await this.prisma.taskOccurrence.findMany({
      where: { userId: user.id, task: { commitment: { goalId } }, status: { not: 'SKIPPED' }, scheduledDate: { gte: toDbDate(since), lte: toDbDate(today) } },
      select: { status: true, completionPercentage: true, scheduledEndTime: true, task: { select: { commitmentId: true } } },
    });
    const now = new Date();
    const consistency = g.commitments
      .filter((c) => !c.archivedAt)
      .map((c) => {
        const mine = occ.filter((o) => o.task.commitmentId === c.id && (o.scheduledEndTime < now || o.status !== 'PENDING'));
        return {
          commitmentId: c.id,
          title: c.title,
          active: c.active,
          planned: mine.length,
          completed: mine.filter((o) => o.status === 'COMPLETED').length,
          completionRate: mine.length ? Math.round(mine.reduce((s, o) => s + o.completionPercentage, 0) / mine.length) : null,
        };
      });
    const progressTotal = g.progressCommitmentId ? await this.goals.progressTotal(this.prisma, user.id, g.progressCommitmentId) : undefined;
    return {
      goal: presentGoal(g, { today, progressTotal, commitmentCount: consistency.length }),
      windowDays: 30,
      commitments: consistency,
    };
  }
}
