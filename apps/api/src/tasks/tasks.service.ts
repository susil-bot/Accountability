import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../database/prisma.service';
import { AppError, badRequest, notFound } from '../common/errors/app-error';
import { AccountabilityService } from '../accountability/accountability.service';
import { CompletionService } from '../accountability/completion.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { fromDbDate, LocalDate, startOfWeek, todayIn, toDbDate } from '../domain/dates';
import { occurrenceInclude, presentOccurrence } from './occurrence.presenter';
import { TaskOccurrence } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountability: AccountabilityService,
    private readonly completion: CompletionService,
  ) {}

  async today(user: AuthUser) {
    const { today } = await this.accountability.catchUp(user.id);
    return this.forDate(user, today);
  }

  async forDate(user: AuthUser, date: LocalDate) {
    const rows = await this.prisma.taskOccurrence.findMany({
      where: {
        userId: user.id,
        OR: [
          { scheduledDate: toDbDate(date), period: 'DAY' },
          { scheduledDate: toDbDate(startOfWeek(date)), period: 'WEEK' },
        ],
      },
      include: occurrenceInclude,
      orderBy: [{ period: 'asc' }, { scheduledStartTime: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    return { date, items: rows.map((r) => presentOccurrence(r, now)) };
  }

  async get(user: AuthUser, id: string) {
    const o = await this.prisma.taskOccurrence.findFirst({ where: { id, userId: user.id }, include: occurrenceInclude });
    if (!o) throw notFound('Task');
    return presentOccurrence(o);
  }

  progress(user: AuthUser, id: string, actualValue: number, note?: string) {
    return this.mutate(user, id, (tx, occ) =>
      this.completion.apply(tx, occ, { actualValue, note, source: 'TASK', actorId: user.id }),
    );
  }

  complete(user: AuthUser, id: string, actualValue?: number, note?: string) {
    return this.mutate(user, id, (tx, occ) => {
      const target = Number(occ.targetValue);
      const value = actualValue ?? target;
      if (value < target && occ.targetUnit !== 'BOOLEAN') {
        throw badRequest('INVALID_COMPLETION', 'To complete, record at least the target — or use partial.');
      }
      return this.completion.apply(tx, occ, { actualValue: occ.targetUnit === 'BOOLEAN' ? 1 : value, note, source: 'TASK', actorId: user.id });
    });
  }

  partial(user: AuthUser, id: string, actualValue: number, note?: string) {
    return this.mutate(user, id, (tx, occ) => {
      if (occ.targetUnit === 'BOOLEAN') throw badRequest('INVALID_PARTIAL', 'Done/not-done tasks can’t be partially completed.');
      if (actualValue <= 0 || actualValue >= Number(occ.targetValue)) {
        throw badRequest('INVALID_PARTIAL', 'A partial value must be above 0 and below the target.');
      }
      return this.completion.apply(tx, occ, { actualValue, note, source: 'TASK', actorId: user.id });
    });
  }

  miss(user: AuthUser, id: string, note?: string) {
    return this.mutate(user, id, (tx, occ) =>
      this.completion.apply(tx, occ, { actualValue: 0, note, source: 'TASK', actorId: user.id, forceStatus: 'MISSED' }),
    );
  }

  reset(user: AuthUser, id: string) {
    return this.mutate(user, id, (tx, occ) => this.completion.reset(tx, occ, user.id));
  }

  /** Load-with-ownership → mutate → refresh day + streak, all in one transaction (spec §51). */
  private async mutate(user: AuthUser, id: string, fn: (tx: Tx, occ: TaskOccurrence) => Promise<TaskOccurrence>) {
    return this.prisma.tx(async (tx) => {
      const occ = await tx.taskOccurrence.findFirst({ where: { id, userId: user.id } });
      if (!occ) throw notFound('Task');
      const today = todayIn(user.timezone);
      const date = occ.period === 'WEEK' ? today : fromDbDate(occ.scheduledDate);
      if (date > today) throw new AppError('OCCURRENCE_NOT_STARTED', 'This task is scheduled for a future day.', 409);
      await fn(tx, occ);
      const streak = await this.accountability.refresh(tx, user.id, date);
      const [fresh, day] = await Promise.all([
        tx.taskOccurrence.findUniqueOrThrow({ where: { id }, include: occurrenceInclude }),
        tx.dailyAccountability.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(date) } } }),
      ]);
      return {
        occurrence: presentOccurrence(fresh),
        day: day && {
          date,
          completionPercentage: day.completionPercentage,
          completedCount: day.completedCount,
          plannedCount: day.plannedCount,
          dailyScore: day.dailyScore,
        },
        streak: { current: streak.current, longest: streak.longest },
      };
    });
  }
}
