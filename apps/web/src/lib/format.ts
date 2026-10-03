import type { GoalStatus, Unit } from './types';

const UNIT_SHORT: Record<Unit, string> = {
  COUNT: '',
  MINUTES: 'min',
  HOURS: 'h',
  PERCENTAGE: '%',
  BOOLEAN: '',
  DISTANCE: 'km',
  CURRENCY: '',
  CUSTOM: '',
};

export const UNIT_LABEL: Record<Unit, string> = {
  BOOLEAN: 'Done / not done',
  COUNT: 'Count',
  MINUTES: 'Minutes',
  HOURS: 'Hours',
  PERCENTAGE: 'Percent',
  DISTANCE: 'Distance (km)',
  CURRENCY: 'Amount',
  CUSTOM: 'Custom unit',
};

export function unitSuffix(unit: Unit, custom?: string | null) {
  if (unit === 'CUSTOM') return custom ?? '';
  return UNIT_SHORT[unit];
}

function num(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** "20 / 30 min", "4 / 5", "Done" */
export function progressLabel(actual: number | null, target: number, unit: Unit, custom?: string | null) {
  if (unit === 'BOOLEAN') return actual && actual > 0 ? 'Done' : 'Not done yet';
  const suffix = unitSuffix(unit, custom);
  return `${num(actual ?? 0)} / ${num(target)}${suffix ? ` ${suffix}` : ''}`;
}

export function targetLabel(target: number, unit: Unit, custom?: string | null) {
  if (unit === 'BOOLEAN') return 'Done / not done';
  const suffix = unitSuffix(unit, custom);
  return `${num(target)}${suffix ? ` ${suffix}` : ''}`;
}

export function formatTime(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** Format a local calendar date ("2026-10-02") without timezone drift. */
export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function hhmmTo12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

export const BLOCKERS: { value: string; label: string }[] = [
  { value: 'TOO_BUSY', label: 'Too busy' },
  { value: 'LOW_ENERGY', label: 'Low energy' },
  { value: 'FORGOT', label: 'Forgot' },
  { value: 'UNEXPECTED_WORK', label: 'Unexpected work' },
  { value: 'TOO_DIFFICULT', label: 'Too difficult' },
  { value: 'POOR_PLANNING', label: 'Poor planning' },
  { value: 'NOT_PRIORITIZED', label: 'Didn’t prioritize it' },
  { value: 'OTHER', label: 'Other' },
];

export const CATEGORIES: { value: string; label: string }[] = [
  { value: 'CAREER', label: 'Career' },
  { value: 'STUDY', label: 'Study' },
  { value: 'FITNESS', label: 'Fitness' },
  { value: 'HEALTH', label: 'Health' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'CODING', label: 'Coding' },
  { value: 'OTHER', label: 'Other' },
];

export const WEEKDAYS = [
  { iso: 1, key: 'MONDAY', short: 'Mon' },
  { iso: 2, key: 'TUESDAY', short: 'Tue' },
  { iso: 3, key: 'WEDNESDAY', short: 'Wed' },
  { iso: 4, key: 'THURSDAY', short: 'Thu' },
  { iso: 5, key: 'FRIDAY', short: 'Fri' },
  { iso: 6, key: 'SATURDAY', short: 'Sat' },
  { iso: 7, key: 'SUNDAY', short: 'Sun' },
];

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'];
  }
}

export const GOAL_STATUS_TONE: Record<GoalStatus, 'success' | 'primary' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  PAUSED: 'warning',
  COMPLETED: 'primary',
  ABANDONED: 'neutral',
};
