'use client';
import { z } from 'zod';
import type { RecurrenceRule, Unit } from '@/lib/types';
import { WEEKDAYS } from '@/lib/format';

/** Form model for one commitment (shared by the goal wizard and the commitment editor). */
export const commitmentSchema = z
  .object({
    title: z.string().trim().min(1, 'Describe the action').max(120),
    scheduleType: z.enum(['DAILY', 'WEEKLY_DAYS', 'TIMES_PER_WEEK']),
    days: z.array(z.string()),
    timesPerWeek: z.number({ invalid_type_error: 'Enter a number' }).int().min(1).max(7),
    targetUnit: z.enum(['BOOLEAN', 'COUNT', 'MINUTES', 'HOURS', 'PERCENTAGE', 'DISTANCE', 'CURRENCY', 'CUSTOM']),
    targetValue: z.number({ invalid_type_error: 'Enter a target' }).positive('Target must be above 0').max(1_000_000),
    customUnitLabel: z.string().max(30).optional(),
    preferredTime: z.string().optional(),
    evidenceRequired: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.scheduleType === 'WEEKLY_DAYS' && v.days.length === 0) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Pick at least one day' });
    if (v.targetUnit === 'CUSTOM' && !v.customUnitLabel?.trim()) ctx.addIssue({ code: 'custom', path: ['customUnitLabel'], message: 'Name your unit' });
  });

export type CommitmentForm = z.infer<typeof commitmentSchema>;

export const emptyCommitment = (title = ''): CommitmentForm => ({
  title,
  scheduleType: 'DAILY',
  days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timesPerWeek: 3,
  targetUnit: 'BOOLEAN',
  targetValue: 1,
  customUnitLabel: '',
  preferredTime: '',
  evidenceRequired: false,
});

export function toRecurrence(c: CommitmentForm): RecurrenceRule {
  if (c.scheduleType === 'WEEKLY_DAYS') return { type: 'WEEKLY_DAYS', days: c.days };
  if (c.scheduleType === 'TIMES_PER_WEEK') return { type: 'TIMES_PER_WEEK', timesPerWeek: c.timesPerWeek };
  return { type: 'DAILY' };
}

export function toPayload(c: CommitmentForm) {
  return {
    title: c.title.trim(),
    recurrence: toRecurrence(c),
    targetValue: c.targetUnit === 'BOOLEAN' ? 1 : c.targetValue,
    targetUnit: c.targetUnit as Unit,
    customUnitLabel: c.targetUnit === 'CUSTOM' ? c.customUnitLabel?.trim() : undefined,
    preferredTime: c.preferredTime || undefined,
    evidenceRequired: c.evidenceRequired,
  };
}

export function fromCommitment(c: { title: string; recurrence: RecurrenceRule | null; targetUnit: Unit; targetValue: number; customUnitLabel: string | null; preferredTime: string | null; evidenceRequired: boolean }): CommitmentForm {
  const r = c.recurrence ?? { type: 'DAILY' };
  return {
    title: c.title,
    scheduleType: r.type === 'MONTHLY' ? 'DAILY' : r.type,
    days: r.days ?? emptyCommitment().days,
    timesPerWeek: r.timesPerWeek ?? 3,
    targetUnit: c.targetUnit,
    targetValue: c.targetValue,
    customUnitLabel: c.customUnitLabel ?? '',
    preferredTime: c.preferredTime ?? '',
    evidenceRequired: c.evidenceRequired,
  };
}

/** Client mirror of the server's soft plan validation (guide, don't block). */
export function planWarnings(items: CommitmentForm[]): string[] {
  const perDay = (c: CommitmentForm) => (c.scheduleType === 'DAILY' ? 1 : c.scheduleType === 'WEEKLY_DAYS' ? c.days.length / 7 : c.timesPerWeek / 7);
  const out: string[] = [];
  const load = items.reduce((s, c) => s + perDay(c), 0);
  if (load > 8) out.push(`Your plan contains about ${Math.round(load)} commitments per day. Consider starting with fewer commitments.`);
  const minutes = items.reduce((s, c) => s + perDay(c) * (c.targetUnit === 'MINUTES' ? c.targetValue : c.targetUnit === 'HOURS' ? c.targetValue * 60 : 0), 0);
  if (minutes > 360) out.push(`Your timed commitments add up to about ${Math.round(minutes / 60)} hours a day. Make sure this fits around work and rest.`);
  return out;
}

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'BOOLEAN', label: 'Done / not done' },
  { value: 'COUNT', label: 'Count (e.g. 5 applications)' },
  { value: 'MINUTES', label: 'Minutes' },
  { value: 'HOURS', label: 'Hours' },
  { value: 'DISTANCE', label: 'Distance (km)' },
  { value: 'PERCENTAGE', label: 'Percent' },
  { value: 'CUSTOM', label: 'Custom unit' },
];

export const DAY_OPTIONS = WEEKDAYS;
