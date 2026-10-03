/**
 * Accountability score (spec §15). NOT a psychological score — a consistency metric, 0–100.
 *
 *   daily = taskCompletion·0.50 + checkIn·0.20 + commitmentAdherence·0.20 + evidence·0.10
 *
 * - taskCompletion: mean completion % across the day's planned occurrences (partial credit).
 * - checkIn: 100 if the check-in was submitted (COMPLETED or LATE), else 0.
 * - commitmentAdherence: % of planned occurrences fully COMPLETED (no partial credit).
 * - evidence: % of evidence-required occurrences that have evidence attached.
 *   When nothing requires evidence that component is not applicable and the remaining
 *   weights are re-normalised, so users aren't rewarded/penalised for an absent rule.
 */
export interface DayOccurrenceInput {
  completionPercentage: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'MISSED' | 'SKIPPED';
  requiresEvidence: boolean;
  hasEvidence: boolean;
}

export interface DayResult {
  plannedCount: number;
  completedCount: number;
  partialCount: number;
  missedCount: number;
  completionPercentage: number;
  commitmentPercentage: number;
  evidencePercentage: number | null;
  dailyScore: number;
}

export const SCORE_WEIGHTS = { task: 0.5, checkIn: 0.2, commitment: 0.2, evidence: 0.1 } as const;
export const SUCCESS_THRESHOLD = 80;

export function computeDay(occurrences: DayOccurrenceInput[], checkInCompleted: boolean): DayResult {
  const planned = occurrences.filter((o) => o.status !== 'SKIPPED');
  const plannedCount = planned.length;
  const completedCount = planned.filter((o) => o.status === 'COMPLETED').length;
  const partialCount = planned.filter((o) => o.status === 'PARTIAL').length;
  const missedCount = planned.filter((o) => o.status === 'MISSED').length;

  const completionPercentage =
    plannedCount === 0 ? 0 : Math.round(planned.reduce((s, o) => s + clamp(o.completionPercentage), 0) / plannedCount);
  const commitmentPercentage = plannedCount === 0 ? 0 : Math.round((completedCount / plannedCount) * 100);

  const evidenceRequired = planned.filter((o) => o.requiresEvidence);
  const evidencePercentage =
    evidenceRequired.length === 0
      ? null
      : Math.round((evidenceRequired.filter((o) => o.hasEvidence).length / evidenceRequired.length) * 100);

  const dailyScore =
    plannedCount === 0 ? 0 : score(completionPercentage, checkInCompleted ? 100 : 0, commitmentPercentage, evidencePercentage);

  return { plannedCount, completedCount, partialCount, missedCount, completionPercentage, commitmentPercentage, evidencePercentage, dailyScore };
}

export function score(task: number, checkIn: number, commitment: number, evidence: number | null): number {
  const w = SCORE_WEIGHTS;
  if (evidence === null) {
    const total = w.task + w.checkIn + w.commitment;
    return Math.round((task * w.task + checkIn * w.checkIn + commitment * w.commitment) / total);
  }
  return Math.round(task * w.task + checkIn * w.checkIn + commitment * w.commitment + evidence * w.evidence);
}

/** A day counts as successful when completion ≥ 80% AND the check-in was completed. */
export function isSuccessfulDay(completionPercentage: number, checkInCompleted: boolean): boolean {
  return completionPercentage >= SUCCESS_THRESHOLD && checkInCompleted;
}

/** Weekly score = sum(dailyScore) / number of active days (days with planned work, excluding rest days). */
export function weeklyScore(days: { dailyScore: number; plannedCount: number; isRestDay: boolean }[]): number | null {
  const active = days.filter((d) => d.plannedCount > 0 && !d.isRestDay);
  if (active.length === 0) return null;
  return Math.round(active.reduce((s, d) => s + d.dailyScore, 0) / active.length);
}

/** Calendar colour band (spec §33). */
export function dayBand(day: { plannedCount: number; completionPercentage: number; isRestDay: boolean } | undefined) {
  if (!day || day.plannedCount === 0) return day?.isRestDay ? 'REST' : 'NONE';
  if (day.completionPercentage >= 80) return 'GREEN';
  if (day.completionPercentage >= 50) return 'AMBER';
  return 'RED';
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}
