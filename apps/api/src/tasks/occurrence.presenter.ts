import { Commitment, Task, TaskOccurrence } from '@prisma/client';
import { fromDbDate } from '../domain/dates';
import { EDIT_GRACE_MS } from '../accountability/completion.service';

export type OccurrenceWithContext = TaskOccurrence & {
  task: Task & { commitment: Pick<Commitment, 'id' | 'goalId' | 'customUnitLabel' | 'preferredTime' | 'title'> };
  _count?: { evidence: number };
};

export function presentOccurrence(o: OccurrenceWithContext, now: Date = new Date()) {
  return {
    id: o.id,
    taskId: o.taskId,
    commitmentId: o.task.commitment.id,
    goalId: o.task.commitment.goalId,
    title: o.title,
    period: o.period,
    scheduledDate: fromDbDate(o.scheduledDate),
    scheduledStartTime: o.scheduledStartTime,
    scheduledEndTime: o.scheduledEndTime,
    preferredTime: o.task.commitment.preferredTime,
    status: o.status,
    targetValue: Number(o.targetValue),
    targetUnit: o.targetUnit,
    unitLabel: o.task.commitment.customUnitLabel,
    actualValue: o.actualValue === null ? null : Number(o.actualValue),
    completionPercentage: o.completionPercentage,
    requiresEvidence: o.requiresEvidence,
    evidenceCount: o._count?.evidence ?? 0,
    completedAt: o.completedAt,
    completedLate: o.completedLate,
    missedAt: o.missedAt,
    editable: o.status !== 'SKIPPED' && now.getTime() <= o.scheduledEndTime.getTime() + EDIT_GRACE_MS,
    dayOpen: now <= o.scheduledEndTime,
  };
}

export const occurrenceInclude = {
  task: { include: { commitment: { select: { id: true, goalId: true, customUnitLabel: true, preferredTime: true, title: true, sortOrder: true } } } },
  _count: { select: { evidence: { where: { deletedAt: null } } } },
} as const;
