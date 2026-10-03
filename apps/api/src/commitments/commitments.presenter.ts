import { Commitment } from '@prisma/client';
import { describeRecurrence, parseRecurrence, RecurrenceRule } from '../domain/recurrence';
import { fromDbDate } from '../domain/dates';

export function presentCommitment(c: Commitment) {
  let rule: RecurrenceRule | null = null;
  try {
    rule = parseRecurrence(c.recurrence);
  } catch {
    rule = null;
  }
  return {
    id: c.id,
    goalId: c.goalId,
    title: c.title,
    description: c.description,
    frequency: c.frequency,
    recurrence: rule,
    schedule: rule ? describeRecurrence(rule) : 'Invalid schedule',
    targetValue: Number(c.targetValue),
    targetUnit: c.targetUnit,
    customUnitLabel: c.customUnitLabel,
    preferredTime: c.preferredTime,
    evidenceRequired: c.evidenceRequired,
    startDate: fromDbDate(c.startDate),
    endDate: c.endDate ? fromDbDate(c.endDate) : null,
    status: c.archivedAt ? 'ARCHIVED' : c.active ? 'ACTIVE' : 'PAUSED',
    pausedAt: c.pausedAt,
    resumeAt: c.resumeAt ? fromDbDate(c.resumeAt) : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
