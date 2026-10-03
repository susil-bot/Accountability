/**
 * Pure mentoring rules: client status on the mentor board, nudge templates and quiet hours,
 * and the rule-based talking points on the prep sheet. No I/O, so every rule is unit tested.
 */
import { addDays, LocalDate } from './dates';

// ───────────────────────────── Client status ─────────────────────────────

export type ClientStatus = 'NEEDS_ATTENTION' | 'WATCH' | 'ON_TRACK' | 'INACTIVE';

/** Board order: the clients who need the mentor most come first. */
export const STATUS_ORDER: Record<ClientStatus, number> = { NEEDS_ATTENTION: 0, WATCH: 1, ON_TRACK: 2, INACTIVE: 3 };

export interface DaySignal {
  date: LocalDate;
  plannedCount: number;
  completionPercentage: number;
  checkInCompleted: boolean;
  isRestDay: boolean;
  /** The day is closed (past local midnight). */
  isFinal: boolean;
}

export const INACTIVE_AFTER_DAYS = 3;

export function clientStatus(input: {
  days: DaySignal[];
  today: LocalDate;
  lastActiveAt: Date | null;
  createdAt: Date;
  now: Date;
}): { status: ClientStatus; reasons: string[] } {
  const lastSeen = input.lastActiveAt ?? input.createdAt;
  const idleDays = Math.floor((input.now.getTime() - lastSeen.getTime()) / 86_400_000);
  if (idleDays >= INACTIVE_AFTER_DAYS) return { status: 'INACTIVE', reasons: [`No activity for ${idleDays} days`] };

  const closed = input.days
    .filter((d) => d.isFinal && d.date < input.today && d.plannedCount > 0 && !d.isRestDay)
    .sort((a, b) => b.date.localeCompare(a.date));

  const reasons: string[] = [];
  const lastThree = closed.slice(0, 3);
  if (lastThree.length === 3 && lastThree.every((d) => d.completionPercentage < 60)) reasons.push('Under 60% for 3 active days in a row');
  const yesterday = closed.find((d) => d.date === addDays(input.today, -1));
  if (yesterday && !yesterday.checkInCompleted) reasons.push("Missed yesterday's check-in");
  if (reasons.length) return { status: 'NEEDS_ATTENTION', reasons };

  const recent = closed.filter((d) => d.date >= addDays(input.today, -3));
  if (recent.some((d) => !d.checkInCompleted)) reasons.push('Missed a check-in in the last 3 days');
  if (recent.some((d) => d.completionPercentage < 50)) reasons.push('A day under 50% in the last 3 days');
  if (reasons.length) return { status: 'WATCH', reasons };
  return { status: 'ON_TRACK', reasons: [] };
}

// ───────────────────────────── Nudges ─────────────────────────────

export const NUDGE_TEMPLATES = {
  CHECKIN_REMINDER: { label: 'Check-in reminder', body: 'Hi {name}, a quick reminder to do today’s check-in. Two honest minutes is all it takes.' },
  MISSED_YESTERDAY: { label: 'Missed yesterday', body: 'Hi {name}, yesterday didn’t go to plan. What got in the way? Let’s make today count.' },
  GREAT_STREAK: { label: 'Great streak', body: 'Great work, {name}! You’re on a {streak}-day streak. Keep going.' },
  GENTLE_RESTART: { label: 'Gentle restart', body: 'Hi {name}, it’s been a few days. One small task today is enough to restart.' },
  SESSION_FOLLOW_UP: { label: 'After our call', body: 'Hi {name}, thanks for today’s call. Your next step: {action}.' },
  CUSTOM: { label: 'Write your own', body: '' },
} as const;
export type NudgeTemplate = keyof typeof NUDGE_TEMPLATES;
export const NUDGE_TEMPLATE_KEYS = Object.keys(NUDGE_TEMPLATES) as NudgeTemplate[];

/** Max nudges a client can receive from mentors per local day (rules included). */
export const NUDGES_PER_DAY = 3;
export const QUIET_START = '22:00';
export const QUIET_END = '07:00';
export const NUDGE_MAX_LENGTH = 500;

export function renderTemplate(template: NudgeTemplate, vars: Record<string, string | number | undefined>): string {
  return NUDGE_TEMPLATES[template].body.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? '').trim() || '…');
}

/** True when `localTime` (HH:mm) falls in the quiet window, which may wrap past midnight. */
export function inQuietHours(localTime: string, start = QUIET_START, end = QUIET_END): boolean {
  if (start === end) return false;
  return start < end ? localTime >= start && localTime < end : localTime >= start || localTime < end;
}

/** E.164-ish phone → digits for a wa.me link (wa.me wants the number without "+"). */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ───────────────────────────── Prep sheet talking points ─────────────────────────────

export interface PrepFacts {
  /** Average completion over active days in this period and the one before (null = no active days). */
  completionNow: number | null;
  completionBefore: number | null;
  checkInsMissed: number;
  streak: number;
  /** First and last confidence (1–5) reported in the period. */
  confidenceFirst: number | null;
  confidenceLast: number | null;
  blockers: { reason: string; count: number }[];
  commitments: { title: string; planned: number; completionRate: number | null }[];
  openActions: { title: string; owner: 'CLIENT' | 'MENTOR'; dueDate: LocalDate | null }[];
  today: LocalDate;
}

export type PointKind = 'CELEBRATE' | 'FOLLOW_UP' | 'EXPLORE' | 'ADJUST';
export interface TalkingPoint {
  id: string;
  kind: PointKind;
  text: string;
  /** The data behind the suggestion, shown under it so the mentor can judge it. */
  because: string;
}

const BLOCKER_ADVICE: Record<string, { label: string; advice: string }> = {
  TOO_BUSY: { label: 'Too busy', advice: 'ask what took the time and agree a fixed slot' },
  LOW_ENERGY: { label: 'Low energy', advice: 'talk about sleep and move the hardest task to their best time of day' },
  FORGOT: { label: 'Forgot', advice: 'tie the task to an existing daily habit or set a reminder at the preferred time' },
  UNEXPECTED_WORK: { label: 'Unexpected work', advice: 'agree a minimum version of each task for busy days' },
  TOO_DIFFICULT: { label: 'Too difficult', advice: 'break the task into a smaller first step' },
  POOR_PLANNING: { label: 'Poor planning', advice: 'plan tomorrow together in the last five minutes of the call' },
  NOT_PRIORITIZED: { label: 'Not prioritised', advice: 'revisit why this goal matters to them right now' },
  OTHER: { label: 'Other', advice: 'ask them to describe what happened' },
};

export function blockerLabel(reason: string) {
  return BLOCKER_ADVICE[reason]?.label ?? reason;
}

const KIND_ORDER: Record<PointKind, number> = { CELEBRATE: 0, FOLLOW_UP: 1, EXPLORE: 2, ADJUST: 3 };
export const MAX_TALKING_POINTS = 8;

/** Deterministic suggestions; the mentor ticks, edits or adds to build the agenda. Celebrations come first. */
export function talkingPoints(f: PrepFacts): TalkingPoint[] {
  const out: TalkingPoint[] = [];
  const add = (id: string, kind: PointKind, text: string, because: string) => out.push({ id, kind, text, because });

  if (f.streak >= 7) add('streak', 'CELEBRATE', `Celebrate the ${f.streak}-day streak first.`, `Current streak: ${f.streak} days`);
  if (f.completionNow !== null && f.completionBefore !== null && f.completionNow - f.completionBefore >= 10) {
    add('improved', 'CELEBRATE', `Completion is up from ${f.completionBefore}% to ${f.completionNow}%: ask what made the difference.`, 'Compared with the previous period');
  }
  for (const c of f.commitments) {
    if (c.planned >= 3 && c.completionRate === 100) add(`perfect:${c.title}`, 'CELEBRATE', `“${c.title}” was done every time.`, `${c.planned} of ${c.planned} completed`);
  }

  for (const a of f.openActions) {
    if (a.dueDate && a.dueDate < f.today) add(`overdue:${a.title}`, 'FOLLOW_UP', `Follow up on “${a.title}” (was due ${a.dueDate}).`, a.owner === 'CLIENT' ? 'Client action, still open' : 'Your action, still open');
  }
  const openNotDue = f.openActions.filter((a) => !a.dueDate || a.dueDate >= f.today).length;
  if (openNotDue > 0) add('open-actions', 'FOLLOW_UP', `Review the ${openNotDue} open action item${openNotDue === 1 ? '' : 's'} from last time.`, 'Agreed in an earlier session');

  if (f.completionNow !== null && f.completionBefore !== null && f.completionBefore - f.completionNow >= 15) {
    add('dropped', 'EXPLORE', `Completion fell from ${f.completionBefore}% to ${f.completionNow}%: ask what changed.`, 'Compared with the previous period');
  }
  if (f.confidenceFirst !== null && f.confidenceLast !== null && f.confidenceFirst - f.confidenceLast >= 2) {
    add('confidence-drop', 'EXPLORE', `Confidence fell from ${f.confidenceFirst} to ${f.confidenceLast}: ask what changed.`, 'From their check-ins');
  } else if (f.confidenceLast !== null && f.confidenceLast <= 2) {
    add('confidence-low', 'EXPLORE', `Confidence is low (${f.confidenceLast}/5): ask what would make tomorrow feel doable.`, 'Latest check-in');
  }
  for (const b of f.blockers.filter((x) => x.count >= 3).slice(0, 2)) {
    const info = BLOCKER_ADVICE[b.reason] ?? BLOCKER_ADVICE.OTHER;
    add(`blocker:${b.reason}`, 'EXPLORE', `“${info.label}” came up ${b.count} times: ${info.advice}.`, 'Blockers from their check-ins');
  }
  if (f.checkInsMissed >= 2) {
    add('checkins', 'EXPLORE', `${f.checkInsMissed} check-ins were missed: ask what makes checking in hard, and move the check-in time if that helps.`, 'Missed check-ins this period');
  }

  for (const c of f.commitments) {
    if (c.planned >= 3 && c.completionRate !== null && c.completionRate < 50) {
      add(`adjust:${c.title}`, 'ADJUST', `“${c.title}” is at ${c.completionRate}%: consider a smaller target or a different time.`, `${c.planned} planned this period`);
    }
  }

  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, MAX_TALKING_POINTS);
}
