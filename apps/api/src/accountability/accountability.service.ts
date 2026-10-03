import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Db, PrismaService } from '../database/prisma.service';
import {
  addDays, endOfLocalDay, fromDbDate, isoWeekday, LocalDate, todayIn, toDbDate, dateRange,
} from '../domain/dates';
import { computeDay, isSuccessfulDay } from '../domain/scoring';
import { computeStreaks, reachedMilestone, StreakResult } from '../domain/streak';
import { checkInSchedule } from '../domain/checkin';
import { GenerationUser, OccurrenceGeneratorService } from './occurrence-generator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { log } from '../common/logging/logger';

/** How far back lazy catch-up will reconstruct unclosed days. */
export const CATCH_UP_MAX_DAYS = 14;

/** Skip repeat catch-ups for the same user within this window (dashboard refetches, tab focus). */
export const CATCH_UP_TTL_MS = 30_000;

export interface AccountabilityUser extends GenerationUser {
  checkInTime: string;
  createdAt: Date;
}

/**
 * The deterministic heart of the product: materialises daily results, closes days,
 * and derives streaks. AI never touches any of this (spec Rule 9/10).
 */
@Injectable()
export class AccountabilityService {
  /** Process-local memo of recent catch-ups: userId → { at, today }. A cache miss is always safe (catch-up is idempotent). */
  private readonly recent = new Map<string, { at: number; today: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: OccurrenceGeneratorService,
    private readonly notifications: NotificationsService,
  ) {}

  async loadUser(db: Db, userId: string): Promise<AccountabilityUser> {
    return db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, timezone: true, restDays: true, checkInTime: true, createdAt: true },
    });
  }

  /**
   * Bring a user fully up to date: close any past days that were never closed, generate today's
   * occurrences, ensure today's check-in row, and refresh today's result + streak.
   * Safe to call on every dashboard load and from the background job.
   */
  async catchUp(userId: string, now?: Date) {
    const explicitNow = now !== undefined;
    now = now ?? new Date();
    const user = await this.loadUser(this.prisma, userId);
    const today = todayIn(user.timezone, now);
    const hit = this.recent.get(userId);
    if (!explicitNow && hit && hit.today === today && now.getTime() - hit.at < CATCH_UP_TTL_MS) return { user, today };

    const lastFinal = await this.prisma.dailyAccountability.findFirst({
      where: { userId, isFinal: true },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    const createdLocal = DateTime.fromJSDate(user.createdAt).setZone(user.timezone).toISODate()!;
    let start = lastFinal ? addDays(fromDbDate(lastFinal.date), 1) : createdLocal;
    const floor = addDays(today, -CATCH_UP_MAX_DAYS);
    if (start < floor) start = floor;

    for (const date of start < today ? dateRange(start, addDays(today, -1)) : []) {
      await this.prisma.tx(async (tx) => {
        await this.generator.generateForDate(tx, user, date);
        await this.closeDay(tx, user, date, now);
      });
    }

    await this.prisma.tx(async (tx) => {
      await this.generator.generateForDate(tx, user, today);
      await this.closeEndedWeeks(tx, user, now);
      await this.ensureCheckIn(tx, user, today);
      await this.recomputeDay(tx, user, today);
      await this.recomputeStreak(tx, user, today);
    });
    this.recent.set(userId, { at: now.getTime(), today });
    if (this.recent.size > 10_000) this.recent.delete(this.recent.keys().next().value as string);
    return { user, today };
  }

  /** Forget the memo (e.g. after settings that change what "today" contains). */
  invalidateCatchUp(userId: string) {
    this.recent.delete(userId);
  }

  async ensureCheckIn(db: Db, user: AccountabilityUser, date: LocalDate) {
    const schedule = checkInSchedule(date, user.checkInTime, user.timezone);
    return db.checkIn.upsert({
      where: { userId_date: { userId: user.id, date: toDbDate(date) } },
      create: { userId: user.id, date: toDbDate(date), scheduledAt: schedule.scheduledAt, status: 'PENDING' },
      update: {},
    });
  }

  /**
   * Close a past local day: pending tasks → MISSED (only after their scheduled end),
   * unsubmitted check-in → MISSED, then finalise the daily result. Idempotent.
   */
  async closeDay(db: Db, user: AccountabilityUser, date: LocalDate, now: Date = new Date()) {
    if (now <= endOfLocalDay(date, user.timezone)) return; // never close a day early
    const day = toDbDate(date);

    await db.taskOccurrence.updateMany({
      where: { userId: user.id, scheduledDate: day, period: 'DAY', status: { in: ['PENDING', 'IN_PROGRESS'] }, completionPercentage: 0, scheduledEndTime: { lt: now } },
      data: { status: 'MISSED', missedAt: now },
    });
    await db.taskOccurrence.updateMany({
      where: { userId: user.id, scheduledDate: day, period: 'DAY', status: { in: ['PENDING', 'IN_PROGRESS'] }, completionPercentage: { gt: 0 }, scheduledEndTime: { lt: now } },
      data: { status: 'PARTIAL' },
    });

    const schedule = checkInSchedule(date, user.checkInTime, user.timezone);
    const existing = await db.checkIn.findUnique({ where: { userId_date: { userId: user.id, date: day } } });
    const planned = await db.taskOccurrence.count({
      where: { userId: user.id, scheduledDate: day, period: 'DAY', status: { not: 'SKIPPED' } },
    });

    let missed = false;
    if (!existing) {
      await db.checkIn.create({ data: { userId: user.id, date: day, scheduledAt: schedule.scheduledAt, status: 'MISSED' } });
      missed = true;
    } else if (existing.status === 'PENDING') {
      await db.checkIn.update({ where: { id: existing.id }, data: { status: 'MISSED' } });
      missed = true;
    }

    if (missed && planned > 0) {
      await this.notifications.createOnce(db, {
        userId: user.id,
        type: 'CHECKIN_MISSED',
        dedupeKey: `CHECKIN_MISSED:${date}`,
        title: 'You missed yesterday’s accountability check-in',
        body: 'No problem — today’s plan is still available. Complete today’s check-in to stay on track.',
        scheduledAt: now,
      });
    }

    await this.recomputeDay(db, user, date, { final: true });
  }

  /** Weekly (N-times-per-week) occurrences settle when their week ends. */
  async closeEndedWeeks(db: Db, user: AccountabilityUser, now: Date) {
    await db.taskOccurrence.updateMany({
      where: { userId: user.id, period: 'WEEK', status: { in: ['PENDING', 'IN_PROGRESS'] }, completionPercentage: 0, scheduledEndTime: { lt: now } },
      data: { status: 'MISSED', missedAt: now },
    });
    await db.taskOccurrence.updateMany({
      where: { userId: user.id, period: 'WEEK', status: { in: ['PENDING', 'IN_PROGRESS'] }, completionPercentage: { gt: 0 }, scheduledEndTime: { lt: now } },
      data: { status: 'PARTIAL' },
    });
  }

  /** Recalculate and store one day's accountability result. */
  async recomputeDay(db: Db, user: AccountabilityUser, date: LocalDate, opts: { final?: boolean } = {}) {
    const day = toDbDate(date);
    const [occurrences, checkIn, existing] = await Promise.all([
      db.taskOccurrence.findMany({
        where: { userId: user.id, scheduledDate: day, period: 'DAY' },
        select: {
          status: true,
          completionPercentage: true,
          requiresEvidence: true,
          _count: { select: { evidence: { where: { deletedAt: null } } } },
        },
      }),
      db.checkIn.findUnique({ where: { userId_date: { userId: user.id, date: day } } }),
      db.dailyAccountability.findUnique({ where: { userId_date: { userId: user.id, date: day } } }),
    ]);

    const checkInCompleted = checkIn?.status === 'COMPLETED' || checkIn?.status === 'LATE';
    const result = computeDay(
      occurrences.map((o) => ({
        status: o.status,
        completionPercentage: o.completionPercentage,
        requiresEvidence: o.requiresEvidence,
        hasEvidence: o._count.evidence > 0,
      })),
      checkInCompleted,
    );
    const isRestDay = user.restDays.includes(isoWeekday(date));
    const isSuccessful = result.plannedCount > 0 && isSuccessfulDay(result.completionPercentage, checkInCompleted);
    const data = {
      plannedCount: result.plannedCount,
      completedCount: result.completedCount,
      partialCount: result.partialCount,
      missedCount: result.missedCount,
      completionPercentage: result.completionPercentage,
      commitmentPercentage: result.commitmentPercentage,
      evidencePercentage: result.evidencePercentage,
      dailyScore: result.dailyScore,
      checkInCompleted,
      isRestDay,
      isSuccessful,
      isFinal: opts.final || existing?.isFinal || false,
    };

    if (checkIn && checkIn.completionPercentage !== result.completionPercentage && checkInCompleted) {
      await db.checkIn.update({ where: { id: checkIn.id }, data: { completionPercentage: result.completionPercentage } });
    }

    return db.dailyAccountability.upsert({
      where: { userId_date: { userId: user.id, date: day } },
      create: { userId: user.id, date: day, ...data },
      update: data,
    });
  }

  /** Streaks are derived from stored history every time (never incremented blindly). */
  async recomputeStreak(db: Db, user: AccountabilityUser, today: LocalDate): Promise<StreakResult> {
    const rows = await db.dailyAccountability.findMany({
      where: { userId: user.id },
      select: { id: true, date: true, plannedCount: true, isRestDay: true, isSuccessful: true, streakDay: true },
      orderBy: { date: 'asc' },
    });
    const result = computeStreaks(
      rows.map((r) => ({ date: fromDbDate(r.date), plannedCount: r.plannedCount, isRestDay: r.isRestDay, isSuccessful: r.isSuccessful })),
      today,
    );

    for (const r of rows) {
      const v = result.byDate[fromDbDate(r.date)];
      if (v !== undefined && v !== r.streakDay) {
        await db.dailyAccountability.update({ where: { id: r.id }, data: { streakDay: v } });
      }
    }

    const before = await db.streak.findUnique({ where: { userId: user.id } });
    const data = {
      currentStreak: result.current,
      longestStreak: result.longest,
      previousStreak: result.previous,
      lastSuccessfulDate: result.lastSuccessfulDate ? toDbDate(result.lastSuccessfulDate) : null,
    };
    await db.streak.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });

    const milestone = reachedMilestone(before?.currentStreak ?? 0, result.current);
    if (milestone && result.lastSuccessfulDate) {
      await this.notifications.createOnce(db, {
        userId: user.id,
        type: 'STREAK_MILESTONE',
        dedupeKey: `STREAK_MILESTONE:${milestone}:${result.lastSuccessfulDate}`,
        title: `${milestone}-day accountability streak`,
        body: `You have kept your commitments for ${milestone} days in a row. Consistency compounds.`,
        scheduledAt: new Date(),
      });
      log.info('streak_milestone', { userId: user.id, milestone });
    }
    return result;
  }

  /** Recompute a day and the streak after any change to that day's data. */
  async refresh(db: Db, userId: string, date: LocalDate, now: Date = new Date()) {
    const user = await this.loadUser(db, userId);
    const today = todayIn(user.timezone, now);
    await this.recomputeDay(db, user, date);
    if (date !== today) await this.recomputeDay(db, user, today);
    return this.recomputeStreak(db, user, today);
  }
}
