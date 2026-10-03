import { computeDay, dayBand, isSuccessfulDay, score, weeklyScore, DayOccurrenceInput } from '../../src/domain/scoring';

const occ = (pct: number, status: DayOccurrenceInput['status'], requiresEvidence = false, hasEvidence = false): DayOccurrenceInput => ({
  completionPercentage: pct,
  status,
  requiresEvidence,
  hasEvidence,
});

describe('daily accountability score', () => {
  it('matches the spec weighting when evidence applies', () => {
    expect(score(80, 100, 60, 50)).toBe(Math.round(80 * 0.5 + 100 * 0.2 + 60 * 0.2 + 50 * 0.1));
  });

  it('re-normalises weights when no evidence is required', () => {
    // (100·0.5 + 100·0.2 + 100·0.2) / 0.9 = 100
    expect(score(100, 100, 100, null)).toBe(100);
    expect(score(50, 0, 0, null)).toBe(Math.round(25 / 0.9));
  });

  it('computes the spec example: 4 of 5 done + check-in → 80%, successful day', () => {
    const day = computeDay(
      [occ(100, 'COMPLETED'), occ(100, 'COMPLETED'), occ(100, 'COMPLETED'), occ(100, 'COMPLETED'), occ(0, 'MISSED')],
      true,
    );
    expect(day.completionPercentage).toBe(80);
    expect(day.commitmentPercentage).toBe(80);
    expect(isSuccessfulDay(day.completionPercentage, true)).toBe(true);
    expect(day.dailyScore).toBe(Math.round((80 * 0.5 + 100 * 0.2 + 80 * 0.2) / 0.9));
  });

  it('gives partial credit in task completion but not in commitment adherence', () => {
    const day = computeDay([occ(100, 'COMPLETED'), occ(100, 'COMPLETED'), occ(66, 'PARTIAL')], true);
    expect(day.completionPercentage).toBe(89);
    expect(day.commitmentPercentage).toBe(67);
    expect(day.partialCount).toBe(1);
  });

  it('excludes SKIPPED occurrences from the plan', () => {
    const day = computeDay([occ(100, 'COMPLETED'), occ(0, 'SKIPPED')], false);
    expect(day.plannedCount).toBe(1);
    expect(day.completionPercentage).toBe(100);
  });

  it('includes evidence when required', () => {
    const day = computeDay([occ(100, 'COMPLETED', true, true), occ(100, 'COMPLETED', true, false)], true);
    expect(day.evidencePercentage).toBe(50);
    expect(day.dailyScore).toBe(Math.round(100 * 0.5 + 100 * 0.2 + 100 * 0.2 + 50 * 0.1));
  });

  it('scores an empty day as 0 rather than dividing by zero', () => {
    expect(computeDay([], true).dailyScore).toBe(0);
  });

  it('60% completion does not count as successful', () => {
    expect(isSuccessfulDay(60, true)).toBe(false);
    expect(isSuccessfulDay(100, false)).toBe(false);
  });
});

describe('weekly score & calendar bands', () => {
  it('averages only active days', () => {
    expect(
      weeklyScore([
        { dailyScore: 90, plannedCount: 4, isRestDay: false },
        { dailyScore: 70, plannedCount: 4, isRestDay: false },
        { dailyScore: 0, plannedCount: 0, isRestDay: true },
      ]),
    ).toBe(80);
    expect(weeklyScore([])).toBeNull();
  });

  it('bands days for the calendar', () => {
    expect(dayBand({ plannedCount: 4, completionPercentage: 80, isRestDay: false })).toBe('GREEN');
    expect(dayBand({ plannedCount: 4, completionPercentage: 79, isRestDay: false })).toBe('AMBER');
    expect(dayBand({ plannedCount: 4, completionPercentage: 49, isRestDay: false })).toBe('RED');
    expect(dayBand({ plannedCount: 0, completionPercentage: 0, isRestDay: true })).toBe('REST');
    expect(dayBand(undefined)).toBe('NONE');
  });
});
