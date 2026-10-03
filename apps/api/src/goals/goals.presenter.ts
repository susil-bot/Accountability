import { Goal } from '@prisma/client';
import { diffInDays, fromDbDate } from '../domain/dates';

export interface GoalProgress {
  type: 'NUMERIC' | 'MANUAL';
  current?: number;
  target?: number;
  percentage?: number;
  completed: boolean;
}

export function presentGoal(g: Goal, opts: { today: string; progressTotal?: number; commitmentCount?: number }) {
  const targetValue = g.targetValue === null ? null : Number(g.targetValue);
  const progress: GoalProgress =
    targetValue && g.progressCommitmentId && opts.progressTotal !== undefined
      ? {
          type: 'NUMERIC',
          current: opts.progressTotal,
          target: targetValue,
          percentage: Math.min(100, Math.floor((opts.progressTotal / targetValue) * 100)),
          completed: g.status === 'COMPLETED',
        }
      : { type: 'MANUAL', completed: g.status === 'COMPLETED' };
  const targetDate = g.targetDate ? fromDbDate(g.targetDate) : null;
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    motivation: g.motivation,
    successMeasure: g.successMeasure,
    category: g.category,
    status: g.status,
    isPrimary: g.isPrimary,
    startDate: fromDbDate(g.startDate),
    targetDate,
    daysRemaining: targetDate ? diffInDays(opts.today, targetDate) : null,
    targetValue,
    targetUnit: g.targetUnit,
    progressCommitmentId: g.progressCommitmentId,
    progress,
    notes: g.notes,
    readOnly: g.status === 'COMPLETED' || g.status === 'ABANDONED',
    commitmentCount: opts.commitmentCount,
    completedAt: g.completedAt,
    pausedAt: g.pausedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}
