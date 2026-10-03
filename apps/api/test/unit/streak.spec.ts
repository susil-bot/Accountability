import { computeStreaks, reachedMilestone, StreakDayInput } from '../../src/domain/streak';
import { addDays } from '../../src/domain/dates';

const day = (date: string, ok: boolean, opts: Partial<StreakDayInput> = {}): StreakDayInput => ({
  date,
  plannedCount: 4,
  isRestDay: false,
  isSuccessful: ok,
  ...opts,
});

function series(start: string, pattern: string): StreakDayInput[] {
  // S = success, F = fail, R = rest, N = no planned work
  return [...pattern].map((c, i) => {
    const date = addDays(start, i);
    if (c === 'R') return day(date, false, { isRestDay: true, plannedCount: 0 });
    if (c === 'N') return day(date, false, { plannedCount: 0 });
    return day(date, c === 'S');
  });
}

describe('streak calculation', () => {
  it('counts consecutive successful days', () => {
    const days = series('2026-09-01', 'SSSSS');
    expect(computeStreaks(days, '2026-09-05')).toMatchObject({ current: 5, longest: 5 });
  });

  it('breaks on a failed day and remembers the previous streak', () => {
    const days = series('2026-09-01', 'SSSFSS');
    const r = computeStreaks(days, '2026-09-06');
    expect(r).toMatchObject({ current: 2, longest: 3, previous: 3 });
    expect(r.byDate['2026-09-04']).toBe(0);
  });

  it('rest days and empty days neither break nor extend the streak', () => {
    const days = series('2026-09-01', 'SSRSNS');
    expect(computeStreaks(days, '2026-09-06')).toMatchObject({ current: 4, longest: 4 });
  });

  it('an unfinished today does not break the streak', () => {
    const days = series('2026-09-01', 'SSSF');
    expect(computeStreaks(days, '2026-09-04').current).toBe(3);
  });

  it('a successful today extends the streak immediately', () => {
    const days = series('2026-09-01', 'SSSS');
    expect(computeStreaks(days, '2026-09-04').current).toBe(4);
  });

  it('a failed yesterday resets the current streak', () => {
    const days = series('2026-09-01', 'SSSF');
    expect(computeStreaks(days, '2026-09-05')).toMatchObject({ current: 0, previous: 3, longest: 3 });
  });

  it('ignores future dates and order of input', () => {
    const days = series('2026-09-01', 'SSSSS').reverse();
    expect(computeStreaks(days, '2026-09-03').current).toBe(3);
  });

  it('detects milestones once', () => {
    expect(reachedMilestone(6, 7)).toBe(7);
    expect(reachedMilestone(7, 8)).toBeNull();
  });
});
