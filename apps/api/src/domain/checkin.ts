import { endOfLocalDay, LocalDate, localTimeToUtc } from './dates';

/**
 * Check-in deadline policy (spec §18–19), all in the user's timezone:
 *   checkInTime          → reminder          (e.g. 21:00)
 *   checkInTime + 60 min → follow-up         (e.g. 22:00), only if not completed
 *   23:59:59 local       → day closes; an unsubmitted check-in becomes MISSED
 * A check-in submitted after the follow-up time is recorded as LATE (still counts).
 */
export const FOLLOW_UP_MINUTES = 60;

export interface CheckInSchedule {
  scheduledAt: Date;
  followUpAt: Date;
  closesAt: Date;
}

export function checkInSchedule(date: LocalDate, checkInTime: string, timezone: string): CheckInSchedule {
  const scheduledAt = localTimeToUtc(date, checkInTime, timezone);
  const closesAt = endOfLocalDay(date, timezone);
  const followUp = new Date(scheduledAt.getTime() + FOLLOW_UP_MINUTES * 60_000);
  return { scheduledAt, followUpAt: followUp < closesAt ? followUp : closesAt, closesAt };
}

export type CheckInWindow = 'BEFORE_REMINDER' | 'OPEN' | 'FOLLOW_UP' | 'CLOSED';

export function checkInWindow(schedule: CheckInSchedule, now: Date): CheckInWindow {
  if (now > schedule.closesAt) return 'CLOSED';
  if (now >= schedule.followUpAt) return 'FOLLOW_UP';
  if (now >= schedule.scheduledAt) return 'OPEN';
  return 'BEFORE_REMINDER';
}

/** Status recorded when the user submits. Returns null if the day is already closed. */
export function submissionStatus(schedule: CheckInSchedule, now: Date): 'COMPLETED' | 'LATE' | null {
  const w = checkInWindow(schedule, now);
  if (w === 'CLOSED') return null;
  return w === 'FOLLOW_UP' ? 'LATE' : 'COMPLETED';
}

/** A task occurrence may only be auto-marked MISSED after its scheduled end. */
export function canAutoMiss(scheduledEndTime: Date, now: Date): boolean {
  return now > scheduledEndTime;
}

export const BLOCKER_REASONS = [
  'TOO_BUSY',
  'LOW_ENERGY',
  'FORGOT',
  'UNEXPECTED_WORK',
  'TOO_DIFFICULT',
  'POOR_PLANNING',
  'NOT_PRIORITIZED',
  'OTHER',
] as const;
export type BlockerReason = (typeof BLOCKER_REASONS)[number];
