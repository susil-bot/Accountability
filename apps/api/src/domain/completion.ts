/**
 * Completion rules (spec §12):
 *   0%      → MISSED
 *   1–99%   → PARTIAL
 *   100%    → COMPLETED
 *   BOOLEAN: true → COMPLETED, false → MISSED
 * Over-achievement is capped at 100% for scoring.
 */
export type Unit = 'COUNT' | 'MINUTES' | 'HOURS' | 'PERCENTAGE' | 'BOOLEAN' | 'DISTANCE' | 'CURRENCY' | 'CUSTOM';
export type CompletionStatus = 'COMPLETED' | 'PARTIAL' | 'MISSED';

export function completionPercentage(actual: number, target: number, unit: Unit): number {
  if (!Number.isFinite(actual) || actual <= 0) return 0;
  if (unit === 'BOOLEAN') return 100;
  if (!Number.isFinite(target) || target <= 0) return 100;
  const pct = Math.floor((actual / target) * 100);
  return Math.max(0, Math.min(100, pct));
}

export function statusFromPercentage(pct: number): CompletionStatus {
  if (pct <= 0) return 'MISSED';
  if (pct >= 100) return 'COMPLETED';
  return 'PARTIAL';
}

export function evaluateCompletion(actual: number, target: number, unit: Unit) {
  const pct = completionPercentage(actual, target, unit);
  return { completionPercentage: pct, status: statusFromPercentage(pct) };
}

/** Map an explicit status choice (check-in step 1) to a numeric actual value. */
export function actualForStatus(status: CompletionStatus, target: number, unit: Unit, partialActual?: number): number {
  if (status === 'COMPLETED') return unit === 'BOOLEAN' ? 1 : target;
  if (status === 'MISSED') return 0;
  if (partialActual !== undefined && partialActual > 0 && (unit === 'BOOLEAN' || partialActual < target)) return partialActual;
  // Partial without a value: half the target (BOOLEAN cannot be partial → treat as missed).
  return unit === 'BOOLEAN' ? 0 : target / 2;
}
