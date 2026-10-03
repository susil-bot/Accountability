import { SUCCESS_THRESHOLD } from '../domain/scoring';

/**
 * Deterministic, non-judgemental daily feedback shown after a check-in.
 * (AI-written feedback arrives in Phase 6 and is layered on top — never replaces this.)
 */
export function dailyFeedback(input: {
  plannedCount: number;
  completedCount: number;
  partialCount: number;
  completionPercentage: number;
  streak: number;
  previousStreak: number;
  missedTitles: string[];
  blockers: string[];
}): { headline: string; detail: string } {
  const { plannedCount, completedCount, completionPercentage: pct, streak } = input;
  if (plannedCount === 0) {
    return { headline: 'Check-in recorded', detail: 'Nothing was planned today. Rest is part of the plan.' };
  }
  const tally = `${completedCount} of ${plannedCount} commitments completed (${pct}%).`;
  if (pct >= SUCCESS_THRESHOLD) {
    return {
      headline: streak > 1 ? `${streak}-day streak` : 'Solid day',
      detail: `${tally} You kept your word to yourself today.`,
    };
  }
  const missed = input.missedTitles.length > 0 ? ` Missed: ${input.missedTitles.slice(0, 3).join(', ')}.` : '';
  const blocker = BLOCKER_COPY[input.blockers[0] ?? ''] ?? '';
  return {
    headline: pct >= 50 ? 'Partly there' : 'Today was hard',
    detail: `${tally}${missed} ${blocker}Tomorrow’s plan is ready — one good day restarts momentum.`.replace(/\s+/g, ' ').trim(),
  };
}

const BLOCKER_COPY: Record<string, string> = {
  TOO_BUSY: 'When days are packed, a smaller version still counts. ',
  LOW_ENERGY: 'On low-energy days, try the easiest commitment first. ',
  FORGOT: 'A reminder at your preferred time may help. ',
  UNEXPECTED_WORK: 'Unexpected work happens; protect one commitment tomorrow. ',
  TOO_DIFFICULT: 'If it keeps feeling too hard, consider a smaller target. ',
  POOR_PLANNING: 'Deciding when you’ll do each commitment can help. ',
  NOT_PRIORITIZED: 'Doing it earlier in the day can make it stick. ',
};
