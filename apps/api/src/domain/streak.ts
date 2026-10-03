import { addDays, compareDates, LocalDate } from './dates';

/**
 * Streaks are DERIVED from stored daily results (never hand-edited, never artificially preserved).
 *
 * Each day is one of:
 *   SUCCESS  – completion ≥ 80% and check-in completed → extends the streak
 *   FAIL     – a planned, non-rest day that did not succeed → breaks the streak
 *   NEUTRAL  – rest day, or no planned work → neither extends nor breaks
 *   OPEN     – today, not yet successful → does not break (the day isn't over)
 */
export type DayOutcome = 'SUCCESS' | 'FAIL' | 'NEUTRAL';

export interface StreakDayInput {
  date: LocalDate;
  plannedCount: number;
  isRestDay: boolean;
  isSuccessful: boolean;
}

export interface StreakResult {
  current: number;
  longest: number;
  previous: number;
  lastSuccessfulDate: LocalDate | null;
  /** streak value as of each date (0 on a breaking day) */
  byDate: Record<LocalDate, number>;
}

export function outcomeOf(day: StreakDayInput | undefined): DayOutcome {
  if (!day) return 'NEUTRAL';
  if (day.isSuccessful) return 'SUCCESS';
  if (day.isRestDay || day.plannedCount === 0) return 'NEUTRAL';
  return 'FAIL';
}

/**
 * @param days  daily results (any order; missing dates are NEUTRAL)
 * @param today the user's current local date; today is only counted if already successful
 */
export function computeStreaks(days: StreakDayInput[], today: LocalDate): StreakResult {
  const sorted = [...days].filter((d) => compareDates(d.date, today) <= 0).sort((a, b) => compareDates(a.date, b.date));
  const byDate: Record<LocalDate, number> = {};
  let run = 0;
  let longest = 0;
  let previous = 0;
  let lastSuccessfulDate: LocalDate | null = null;

  for (const day of sorted) {
    const outcome = outcomeOf(day);
    const isToday = day.date === today;
    if (outcome === 'SUCCESS') {
      run += 1;
      lastSuccessfulDate = day.date;
      longest = Math.max(longest, run);
    } else if (outcome === 'FAIL' && !isToday) {
      if (run > 0) previous = run;
      run = 0;
    }
    byDate[day.date] = run;
  }

  return { current: run, longest, previous, lastSuccessfulDate, byDate };
}

/** Milestones worth a (calm) notification. */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 180, 365];

export function reachedMilestone(before: number, after: number): number | null {
  return STREAK_MILESTONES.find((m) => before < m && after >= m) ?? null;
}

export { addDays };
