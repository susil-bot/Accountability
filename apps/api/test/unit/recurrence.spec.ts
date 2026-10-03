import { appliesOnDate, describeRecurrence, parseRecurrence, RecurrenceError } from '../../src/domain/recurrence';
import { planWarnings } from '../../src/domain/plan-validation';

describe('recurrence engine', () => {
  it('DAILY applies every day', () => {
    const r = parseRecurrence({ type: 'DAILY' });
    expect(['2026-10-01', '2026-10-03', '2026-10-04'].every((d) => appliesOnDate(r, d))).toBe(true);
  });

  it('WEEKLY_DAYS applies only on chosen weekdays', () => {
    const r = parseRecurrence({ type: 'WEEKLY_DAYS', days: ['MONDAY', 'TUESDAY', 'THURSDAY', 'FRIDAY'] });
    expect(appliesOnDate(r, '2026-09-28')).toBe(true); // Mon
    expect(appliesOnDate(r, '2026-09-30')).toBe(false); // Wed
    expect(appliesOnDate(r, '2026-10-02')).toBe(true); // Fri
    expect(appliesOnDate(r, '2026-10-04')).toBe(false); // Sun
  });

  it('MONTHLY clamps to the last day of short months', () => {
    const r = parseRecurrence({ type: 'MONTHLY', dayOfMonth: 31 });
    expect(appliesOnDate(r, '2026-02-28')).toBe(true);
    expect(appliesOnDate(r, '2026-03-30')).toBe(false);
    expect(appliesOnDate(r, '2026-03-31')).toBe(true);
    expect(appliesOnDate(parseRecurrence({ type: 'MONTHLY', dayOfMonth: 1 }), '2026-10-01')).toBe(true);
  });

  it('TIMES_PER_WEEK never produces a daily occurrence', () => {
    const r = parseRecurrence({ type: 'TIMES_PER_WEEK', timesPerWeek: 4 });
    expect(appliesOnDate(r, '2026-10-02')).toBe(false);
    expect(describeRecurrence(r)).toBe('4× per week');
  });

  it('rejects invalid rules', () => {
    expect(() => parseRecurrence({ type: 'WEEKLY_DAYS', days: [] })).toThrow(RecurrenceError);
    expect(() => parseRecurrence({ type: 'WEEKLY_DAYS', days: ['FUNDAY'] })).toThrow(RecurrenceError);
    expect(() => parseRecurrence({ type: 'TIMES_PER_WEEK', timesPerWeek: 9 })).toThrow(RecurrenceError);
    expect(() => parseRecurrence({ type: 'HOURLY' })).toThrow(RecurrenceError);
    expect(() => parseRecurrence(null)).toThrow(RecurrenceError);
  });

  it('dedupes and orders weekdays', () => {
    expect(parseRecurrence({ type: 'WEEKLY_DAYS', days: ['FRIDAY', 'MONDAY', 'FRIDAY'] })).toEqual({
      type: 'WEEKLY_DAYS',
      days: ['MONDAY', 'FRIDAY'],
    });
  });
});

describe('plan validation guides but never blocks', () => {
  it('warns about very large daily plans', () => {
    const items = Array.from({ length: 20 }, () => ({ recurrence: { type: 'DAILY' as const }, targetValue: 1, targetUnit: 'BOOLEAN' }));
    expect(planWarnings(items)[0]).toMatch(/Consider starting with fewer commitments/);
  });
  it('is quiet for a reasonable plan', () => {
    expect(planWarnings([{ recurrence: { type: 'DAILY' }, targetValue: 30, targetUnit: 'MINUTES' }])).toEqual([]);
  });
  it('warns about too many hours', () => {
    expect(planWarnings([{ recurrence: { type: 'DAILY' }, targetValue: 8, targetUnit: 'HOURS' }])).toHaveLength(1);
  });
});
