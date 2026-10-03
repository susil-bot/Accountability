import { describe, expect, it } from 'vitest';
import { commitmentSchema, emptyCommitment, planWarnings, toPayload } from './commitment-schema';

describe('commitment schema', () => {
  it('requires weekdays for "some days" schedules and a name for custom units', () => {
    const bad = commitmentSchema.safeParse({ ...emptyCommitment('Run'), scheduleType: 'WEEKLY_DAYS', days: [] });
    expect(bad.success).toBe(false);
    const custom = commitmentSchema.safeParse({ ...emptyCommitment('Read'), targetUnit: 'CUSTOM', targetValue: 20, customUnitLabel: '' });
    expect(custom.success).toBe(false);
  });

  it('maps the form to the API payload', () => {
    expect(toPayload({ ...emptyCommitment('Read'), targetUnit: 'BOOLEAN', targetValue: 7 })).toMatchObject({ targetValue: 1, recurrence: { type: 'DAILY' } });
    expect(toPayload({ ...emptyCommitment('Gym'), scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 4 }).recurrence).toEqual({ type: 'TIMES_PER_WEEK', timesPerWeek: 4 });
  });

  it('warns (but never blocks) on heavy plans', () => {
    const heavy = [{ ...emptyCommitment('A'), targetUnit: 'HOURS' as const, targetValue: 4 }, { ...emptyCommitment('B'), targetUnit: 'HOURS' as const, targetValue: 4 }];
    expect(planWarnings(heavy)[0]).toMatch(/hours a day/);
    expect(planWarnings([emptyCommitment('A')])).toEqual([]);
  });
});
