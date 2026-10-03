import { dayOfMonth, daysInMonth, isoWeekday, LocalDate } from './dates';

/**
 * Structured recurrence (deliberately NOT full RFC 5545).
 *
 *  { "type": "DAILY" }                                   every day
 *  { "type": "WEEKLY_DAYS", "days": ["MONDAY","FRIDAY"] } specific weekdays
 *  { "type": "TIMES_PER_WEEK", "timesPerWeek": 4 }        flexible: N times anywhere in the week
 *  { "type": "MONTHLY", "dayOfMonth": 1 }                 a day of the month (clamped to month end)
 */
export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type RecurrenceRule =
  | { type: 'DAILY' }
  | { type: 'WEEKLY_DAYS'; days: Weekday[] }
  | { type: 'TIMES_PER_WEEK'; timesPerWeek: number }
  | { type: 'MONTHLY'; dayOfMonth: number };

export class RecurrenceError extends Error {}

export function parseRecurrence(input: unknown): RecurrenceRule {
  if (!input || typeof input !== 'object') throw new RecurrenceError('Recurrence must be an object');
  const r = input as Record<string, unknown>;
  switch (r.type) {
    case 'DAILY':
      return { type: 'DAILY' };
    case 'WEEKLY_DAYS': {
      if (!Array.isArray(r.days) || r.days.length === 0) throw new RecurrenceError('Choose at least one weekday');
      const days = [...new Set(r.days as string[])];
      if (!days.every((d) => (WEEKDAYS as readonly string[]).includes(d))) throw new RecurrenceError('Invalid weekday');
      days.sort((a, b) => WEEKDAYS.indexOf(a as Weekday) - WEEKDAYS.indexOf(b as Weekday));
      return { type: 'WEEKLY_DAYS', days: days as Weekday[] };
    }
    case 'TIMES_PER_WEEK': {
      const n = Number(r.timesPerWeek);
      if (!Number.isInteger(n) || n < 1 || n > 7) throw new RecurrenceError('timesPerWeek must be 1–7');
      return { type: 'TIMES_PER_WEEK', timesPerWeek: n };
    }
    case 'MONTHLY': {
      const n = Number(r.dayOfMonth);
      if (!Number.isInteger(n) || n < 1 || n > 31) throw new RecurrenceError('dayOfMonth must be 1–31');
      return { type: 'MONTHLY', dayOfMonth: n };
    }
    default:
      throw new RecurrenceError('Unknown recurrence type');
  }
}

/** Whether a rule produces a per-DAY occurrence on `date`. TIMES_PER_WEEK never does (it is weekly). */
export function appliesOnDate(rule: RecurrenceRule, date: LocalDate): boolean {
  switch (rule.type) {
    case 'DAILY':
      return true;
    case 'WEEKLY_DAYS':
      return rule.days.includes(WEEKDAYS[isoWeekday(date) - 1]);
    case 'MONTHLY':
      return dayOfMonth(date) === Math.min(rule.dayOfMonth, daysInMonth(date));
    case 'TIMES_PER_WEEK':
      return false;
  }
}

export function isWeeklyCount(rule: RecurrenceRule): rule is { type: 'TIMES_PER_WEEK'; timesPerWeek: number } {
  return rule.type === 'TIMES_PER_WEEK';
}

/** Rough number of daily occurrences per week (for plan-load validation). */
export function weeklyLoad(rule: RecurrenceRule): number {
  switch (rule.type) {
    case 'DAILY':
      return 7;
    case 'WEEKLY_DAYS':
      return rule.days.length;
    case 'TIMES_PER_WEEK':
      return rule.timesPerWeek;
    case 'MONTHLY':
      return 0.25;
  }
}

export function frequencyOf(rule: RecurrenceRule): 'DAILY' | 'WEEKLY' | 'CUSTOM' {
  if (rule.type === 'DAILY') return 'DAILY';
  if (rule.type === 'WEEKLY_DAYS' || rule.type === 'TIMES_PER_WEEK') return 'WEEKLY';
  return 'CUSTOM';
}

export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.type) {
    case 'DAILY':
      return 'Every day';
    case 'WEEKLY_DAYS':
      return rule.days.length === 5 && !rule.days.includes('SATURDAY') && !rule.days.includes('SUNDAY')
        ? 'Weekdays'
        : rule.days.map((d) => d.slice(0, 1) + d.slice(1, 3).toLowerCase()).join(', ');
    case 'TIMES_PER_WEEK':
      return `${rule.timesPerWeek}× per week`;
    case 'MONTHLY':
      return `Monthly on day ${rule.dayOfMonth}`;
  }
}
