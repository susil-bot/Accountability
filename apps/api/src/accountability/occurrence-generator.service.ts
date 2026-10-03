import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from '../database/prisma.service';
import {
  endOfLocalDay, endOfWeek, isoWeekday, LocalDate, localTimeToUtc, startOfLocalDay, startOfWeek, toDbDate,
} from '../domain/dates';
import { appliesOnDate, isWeeklyCount, parseRecurrence } from '../domain/recurrence';
import { log } from '../common/logging/logger';

export interface GenerationUser {
  id: string;
  timezone: string;
  restDays: number[];
}

/**
 * Creates TaskOccurrence rows for a user's active commitments on a local date.
 * Idempotent: relies on UNIQUE(taskId, scheduledDate) + skipDuplicates, so the
 * background job and the dashboard's lazy generation can both call it safely.
 */
@Injectable()
export class OccurrenceGeneratorService {
  async generateForDate(db: Db, user: GenerationUser, date: LocalDate): Promise<number> {
    const day = toDbDate(date);

    // Resume commitments whose scheduled resume date has arrived.
    await db.commitment.updateMany({
      where: { goal: { userId: user.id }, active: false, archivedAt: null, pausedAt: { not: null }, resumeAt: { lte: day } },
      data: { active: true, pausedAt: null, resumeAt: null },
    });

    const commitments = await db.commitment.findMany({
      where: {
        goal: { userId: user.id, status: 'ACTIVE' },
        active: true,
        archivedAt: null,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
      },
      include: { tasks: { where: { archivedAt: null } } },
    });

    const isRestDay = user.restDays.includes(isoWeekday(date));
    const rows: Prisma.TaskOccurrenceCreateManyInput[] = [];

    for (const c of commitments) {
      let rule;
      try {
        rule = parseRecurrence(c.recurrence);
      } catch {
        log.warn('invalid_recurrence', { commitmentId: c.id });
        continue;
      }

      if (isWeeklyCount(rule)) {
        const weekStart = startOfWeek(date);
        for (const t of c.tasks) {
          rows.push({
            taskId: t.id,
            userId: user.id,
            scheduledDate: toDbDate(weekStart),
            period: 'WEEK',
            scheduledStartTime: startOfLocalDay(weekStart, user.timezone),
            scheduledEndTime: endOfLocalDay(endOfWeek(date), user.timezone),
            title: t.title,
            targetValue: rule.timesPerWeek,
            targetUnit: 'COUNT',
            requiresEvidence: c.evidenceRequired || t.requiresEvidence,
          });
        }
        continue;
      }

      if (isRestDay || !appliesOnDate(rule, date)) continue;
      for (const t of c.tasks) {
        rows.push({
          taskId: t.id,
          userId: user.id,
          scheduledDate: day,
          period: 'DAY',
          scheduledStartTime: c.preferredTime
            ? localTimeToUtc(date, c.preferredTime, user.timezone)
            : startOfLocalDay(date, user.timezone),
          scheduledEndTime: endOfLocalDay(date, user.timezone),
          title: t.title,
          // Snapshot: later edits to the commitment never rewrite this row.
          targetValue: c.targetValue,
          targetUnit: c.targetUnit,
          requiresEvidence: c.evidenceRequired || t.requiresEvidence,
        });
      }
    }

    if (rows.length === 0) return 0;
    const res = await db.taskOccurrence.createMany({ data: rows, skipDuplicates: true });
    return res.count;
  }
}
