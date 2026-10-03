import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AppError, badRequest } from '../common/errors/app-error';
import { AccountabilityService } from '../accountability/accountability.service';
import { CompletionService } from '../accountability/completion.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { checkInSchedule, checkInWindow, submissionStatus } from '../domain/checkin';
import { actualForStatus, Unit } from '../domain/completion';
import { fromDbDate, startOfWeek, todayIn, toDbDate } from '../domain/dates';
import { SubmitCheckInDto } from './checkins.dto';
import { TasksService } from '../tasks/tasks.service';
import { dailyFeedback } from './feedback';
import { CheckIn } from '@prisma/client';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountability: AccountabilityService,
    private readonly completion: CompletionService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
  ) {}

  async today(user: AuthUser) {
    const { user: acc, today } = await this.accountability.catchUp(user.id);
    const [checkIn, tasks] = await Promise.all([
      this.prisma.checkIn.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: toDbDate(today) } } }),
      this.tasks.forDate(user, today),
    ]);
    const schedule = checkInSchedule(today, acc.checkInTime, acc.timezone);
    return {
      date: today,
      checkIn: presentCheckIn(checkIn),
      schedule: { ...schedule, window: checkInWindow(schedule, new Date()) },
      items: tasks.items,
    };
  }

  async submit(user: AuthUser, dto: SubmitCheckInDto) {
    const now = new Date();
    const result = await this.prisma.tx(async (tx) => {
      const acc = await this.accountability.loadUser(tx, user.id);
      const today = todayIn(acc.timezone, now);
      const schedule = checkInSchedule(today, acc.checkInTime, acc.timezone);
      const status = submissionStatus(schedule, now);
      if (!status) throw new AppError('CHECKIN_CLOSED', 'Today’s check-in window has closed.', 409);

      const seen = new Set<string>();
      for (const item of dto.items) {
        if (seen.has(item.occurrenceId)) throw badRequest('DUPLICATE_ITEM', 'Each task can only appear once in a check-in.');
        seen.add(item.occurrenceId);
        const occ = await tx.taskOccurrence.findFirst({ where: { id: item.occurrenceId, userId: user.id } });
        if (!occ) throw new AppError('TASK_NOT_FOUND', 'Task could not be found.', 404);
        const date = fromDbDate(occ.scheduledDate);
        const belongsToToday = (occ.period === 'DAY' && date === today) || (occ.period === 'WEEK' && date === startOfWeek(today));
        if (!belongsToToday) throw badRequest('INVALID_CHECKIN_ITEM', 'Only today’s tasks can be included in today’s check-in.');
        if (occ.status === 'SKIPPED') continue;

        const target = Number(occ.targetValue);
        const unit = occ.targetUnit as Unit;
        let actual: number;
        if (occ.period === 'WEEK') {
          if (item.actualValue === undefined) continue; // weekly counts only change when a value is given
          actual = item.actualValue;
        } else {
          actual = actualForStatus(item.status, target, unit, item.actualValue);
        }
        const unchanged = occ.actualValue !== null && Number(occ.actualValue) === actual && occ.status === item.status;
        if (unchanged) continue;
        await this.completion.apply(
          tx,
          occ,
          { actualValue: actual, source: 'CHECKIN', actorId: user.id, forceStatus: item.status === 'MISSED' && occ.period === 'DAY' ? 'MISSED' : undefined },
          now,
        );
      }

      const existing = await tx.checkIn.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(today) } } });
      const data = {
        status,
        completedAt: now,
        startedAt: existing?.startedAt ?? now,
        blockers: dto.blockers ?? [],
        blocker: dto.blockerNote ?? null,
        confidence: dto.confidence,
        mood: dto.mood ?? null,
        reflection: dto.reflection ?? null,
        reflectionPrivate: dto.reflectionPrivate ?? false,
      };
      const checkIn = await tx.checkIn.upsert({
        where: { userId_date: { userId: user.id, date: toDbDate(today) } },
        create: { userId: user.id, date: toDbDate(today), scheduledAt: schedule.scheduledAt, ...data },
        update: data,
      });

      const streak = await this.accountability.refresh(tx, user.id, today, now);
      const day = await tx.dailyAccountability.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: toDbDate(today) } } });
      const missed = await tx.taskOccurrence.findMany({
        where: { userId: user.id, scheduledDate: toDbDate(today), period: 'DAY', status: 'MISSED' },
        select: { title: true },
      });
      await this.audit.record(
        {
          userId: user.id,
          action: 'CHECKIN_SUBMITTED',
          entityType: 'CheckIn',
          entityId: checkIn.id,
          metadata: { date: today, status, items: dto.items.length, completionPercentage: day.completionPercentage, resubmission: !!existing?.completedAt },
        },
        tx,
      );
      return {
        checkIn: presentCheckIn({ ...checkIn, completionPercentage: day.completionPercentage }),
        day: {
          date: today,
          completionPercentage: day.completionPercentage,
          completedCount: day.completedCount,
          plannedCount: day.plannedCount,
          dailyScore: day.dailyScore,
          isSuccessful: day.isSuccessful,
        },
        streak: { current: streak.current, longest: streak.longest, previous: streak.previous },
        feedback: dailyFeedback({
          plannedCount: day.plannedCount,
          completedCount: day.completedCount,
          partialCount: day.partialCount,
          completionPercentage: day.completionPercentage,
          streak: streak.current,
          previousStreak: streak.previous,
          missedTitles: missed.map((m) => m.title),
          blockers: dto.blockers ?? [],
        }),
      };
    });
    return result;
  }

  async history(user: AuthUser, limit = 30) {
    const rows = await this.prisma.checkIn.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: limit,
    });
    const days = await this.prisma.dailyAccountability.findMany({
      where: { userId: user.id, date: { in: rows.map((r) => r.date) } },
    });
    const byDate = new Map(days.map((d) => [fromDbDate(d.date), d]));
    return rows.map((r) => {
      const d = byDate.get(fromDbDate(r.date));
      return {
        ...presentCheckIn(r),
        dailyScore: d?.dailyScore ?? null,
        plannedCount: d?.plannedCount ?? 0,
        completedCount: d?.completedCount ?? 0,
      };
    });
  }
}

export function presentCheckIn(c: CheckIn) {
  return {
    id: c.id,
    date: fromDbDate(c.date),
    status: c.status,
    scheduledAt: c.scheduledAt,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    completionPercentage: c.completionPercentage,
    blockers: c.blockers,
    blockerNote: c.blocker,
    confidence: c.confidence,
    mood: c.mood,
    reflection: c.reflection,
    reflectionPrivate: c.reflectionPrivate,
  };
}
