import { DateTime, IANAZone } from 'luxon';

/**
 * Timezone helpers. Every "which day is it?" question in the system goes through here.
 * A LocalDate is an ISO calendar date string ("2026-10-02") in the USER's timezone.
 * Instants are JS Dates (UTC). We never call `new Date().getDate()` for business logic.
 */
export type LocalDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimezone(tz: string): boolean {
  return typeof tz === 'string' && tz.length > 0 && IANAZone.isValidZone(tz);
}

export function isValidLocalDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return DateTime.fromISO(value, { zone: 'utc' }).isValid;
}

export function isValidTimeOfDay(value: string): boolean {
  return HHMM.test(value);
}

/** The user's current local calendar date. */
export function todayIn(timezone: string, now: Date = new Date()): LocalDate {
  return DateTime.fromJSDate(now).setZone(timezone).toISODate()!;
}

/** Convert a local date + "HH:mm" in a timezone to a UTC instant. Handles DST gaps via luxon. */
export function localTimeToUtc(date: LocalDate, time: string, timezone: string): Date {
  const [h, m] = time.split(':').map(Number);
  return DateTime.fromISO(date, { zone: timezone }).set({ hour: h, minute: m, second: 0, millisecond: 0 }).toJSDate();
}

/** First instant of the local day, in UTC. */
export function startOfLocalDay(date: LocalDate, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).startOf('day').toJSDate();
}

/** Last instant (23:59:59.999) of the local day, in UTC. */
export function endOfLocalDay(date: LocalDate, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).endOf('day').toJSDate();
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate()!;
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday;
}

export function dayOfMonth(date: LocalDate): number {
  return DateTime.fromISO(date, { zone: 'utc' }).day;
}

export function daysInMonth(date: LocalDate): number {
  return DateTime.fromISO(date, { zone: 'utc' }).daysInMonth!;
}

/** Monday of the ISO week containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  return DateTime.fromISO(date, { zone: 'utc' }).startOf('week').toISODate()!;
}

export function endOfWeek(date: LocalDate): LocalDate {
  return addDays(startOfWeek(date), 6);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive list of local dates from `from` to `to`. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function diffInDays(from: LocalDate, to: LocalDate): number {
  return Math.round(
    DateTime.fromISO(to, { zone: 'utc' }).diff(DateTime.fromISO(from, { zone: 'utc' }), 'days').days,
  );
}

/** Prisma @db.Date columns round-trip as UTC midnight Dates. */
export function toDbDate(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

/** Local hour (0–23) right now in the timezone — used for greetings. */
export function localHour(timezone: string, now: Date = new Date()): number {
  return DateTime.fromJSDate(now).setZone(timezone).hour;
}
