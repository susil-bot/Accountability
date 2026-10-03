import { RecurrenceRule, weeklyLoad } from './recurrence';

/** Guide, don't block (spec §29). Returns human warnings; never throws. */
export const DAILY_COMMITMENT_SOFT_LIMIT = 8;
export const DAILY_MINUTES_SOFT_LIMIT = 6 * 60;

export interface PlanItem {
  recurrence: RecurrenceRule;
  targetValue: number;
  targetUnit: string;
}

export function planWarnings(items: PlanItem[]): string[] {
  const warnings: string[] = [];
  const dailyEquivalent = items.reduce((s, i) => s + weeklyLoad(i.recurrence) / 7, 0);
  if (dailyEquivalent > DAILY_COMMITMENT_SOFT_LIMIT) {
    warnings.push(
      `Your plan contains about ${Math.round(dailyEquivalent)} commitments per day. Consider starting with fewer commitments — you can add more once the habit sticks.`,
    );
  }
  const minutes = items.reduce((s, i) => {
    const perDay = weeklyLoad(i.recurrence) / 7;
    if (i.targetUnit === 'MINUTES') return s + i.targetValue * perDay;
    if (i.targetUnit === 'HOURS') return s + i.targetValue * 60 * perDay;
    return s;
  }, 0);
  if (minutes > DAILY_MINUTES_SOFT_LIMIT) {
    warnings.push(
      `Your timed commitments add up to about ${Math.round(minutes / 60)} hours a day. Make sure this fits around work and rest.`,
    );
  }
  return warnings;
}
