import { Injectable } from '@nestjs/common';
import { OccurrenceStatus, TaskOccurrence } from '@prisma/client';
import { Db } from '../database/prisma.service';
import { AppError } from '../common/errors/app-error';
import { evaluateCompletion, Unit } from '../domain/completion';
import { AuditService } from '../audit/audit.service';

/** Late edits are allowed for 48h after an occurrence's scheduled end, then it is locked. */
export const EDIT_GRACE_MS = 48 * 60 * 60 * 1000;

export type CompletionSource = 'TASK' | 'CHECKIN' | 'RESET';

/**
 * Applies a completion update to one occurrence: status transition + append-only
 * TaskCompletion row (exactly one `isCurrent`). Must be called inside a transaction;
 * the caller then refreshes daily accountability + streak in the same transaction.
 */
@Injectable()
export class CompletionService {
  constructor(private readonly audit: AuditService) {}

  assertEditable(occ: TaskOccurrence, now: Date) {
    if (occ.status === 'SKIPPED') throw new AppError('OCCURRENCE_SKIPPED', 'This task was skipped and can’t be updated.', 409);
    if (now.getTime() > occ.scheduledEndTime.getTime() + EDIT_GRACE_MS) {
      throw new AppError('OCCURRENCE_LOCKED', 'This task is more than 48 hours old and can no longer be changed.', 409);
    }
  }

  async apply(
    db: Db,
    occ: TaskOccurrence,
    input: { actualValue: number; note?: string; source: CompletionSource; actorId: string; forceStatus?: 'MISSED' },
    now: Date = new Date(),
  ) {
    this.assertEditable(occ, now);
    const target = Number(occ.targetValue);
    const actual = Math.max(0, input.actualValue);
    const evaln = evaluateCompletion(actual, target, occ.targetUnit as Unit);
    let status: OccurrenceStatus = input.forceStatus ?? evaln.status;

    // A weekly "N times" occurrence is still in progress until its week ends.
    const periodOpen = now <= occ.scheduledEndTime;
    if (occ.period === 'WEEK' && periodOpen && status !== 'COMPLETED') {
      status = evaln.completionPercentage > 0 ? 'IN_PROGRESS' : 'PENDING';
    }

    const done = status === 'COMPLETED' || status === 'PARTIAL' || status === 'IN_PROGRESS';
    const late = done && now > occ.scheduledEndTime;
    const updated = await db.taskOccurrence.update({
      where: { id: occ.id },
      data: {
        status,
        actualValue: actual,
        completionPercentage: evaln.completionPercentage,
        completedAt: done ? now : null,
        missedAt: status === 'MISSED' ? now : null,
        completedLate: late,
        completionDelayMinutes: done ? Math.max(0, Math.round((now.getTime() - occ.scheduledStartTime.getTime()) / 60_000)) : null,
      },
    });

    await db.taskCompletion.updateMany({ where: { taskOccurrenceId: occ.id, isCurrent: true }, data: { isCurrent: false } });
    await db.taskCompletion.create({
      data: {
        taskOccurrenceId: occ.id,
        status,
        actualValue: actual,
        completionPercentage: evaln.completionPercentage,
        note: input.note,
        source: input.source,
        isCurrent: true,
        completedAt: now,
      },
    });

    await this.audit.record(
      {
        userId: occ.userId,
        actorId: input.actorId,
        action: status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_CHANGED',
        entityType: 'TaskOccurrence',
        entityId: occ.id,
        metadata: { from: occ.status, to: status, actualValue: actual, source: input.source, late },
      },
      db,
    );
    return updated;
  }

  async reset(db: Db, occ: TaskOccurrence, actorId: string, now: Date = new Date()) {
    this.assertEditable(occ, now);
    if (now > occ.scheduledEndTime) {
      throw new AppError('OCCURRENCE_CLOSED', 'This day has ended — record what happened instead of resetting.', 409);
    }
    const updated = await db.taskOccurrence.update({
      where: { id: occ.id },
      data: { status: 'PENDING', actualValue: null, completionPercentage: 0, completedAt: null, missedAt: null, completedLate: false, completionDelayMinutes: null },
    });
    await db.taskCompletion.updateMany({ where: { taskOccurrenceId: occ.id, isCurrent: true }, data: { isCurrent: false } });
    await db.taskCompletion.create({
      data: { taskOccurrenceId: occ.id, status: 'PENDING', completionPercentage: 0, source: 'RESET', isCurrent: true, completedAt: now },
    });
    await this.audit.record(
      { userId: occ.userId, actorId, action: 'TASK_CHANGED', entityType: 'TaskOccurrence', entityId: occ.id, metadata: { from: occ.status, to: 'PENDING', source: 'RESET' } },
      db,
    );
    return updated;
  }
}
