/** Shapes and labels shared by the mentor, admin and client mentoring screens. */
import type { Band, CheckInStatus, DayDetail, DaySummary, EvidenceItem, GoalCategory, GoalDetail } from './types';

export type ClientStatus = 'NEEDS_ATTENTION' | 'WATCH' | 'ON_TRACK' | 'INACTIVE';
export type SessionChannel = 'WHATSAPP' | 'PHONE' | 'VIDEO' | 'IN_PERSON';
export type SessionStatus = 'SCHEDULED' | 'DONE' | 'NO_SHOW' | 'CANCELLED';
export type ActionOwner = 'CLIENT' | 'MENTOR';
export type ActionStatus = 'OPEN' | 'DONE' | 'DROPPED';

export const STATUS_LABEL: Record<ClientStatus, string> = { NEEDS_ATTENTION: 'Needs attention', WATCH: 'Watch', ON_TRACK: 'On track', INACTIVE: 'Inactive' };
export const STATUS_TONE: Record<ClientStatus, 'danger' | 'warning' | 'success' | 'neutral'> = { NEEDS_ATTENTION: 'danger', WATCH: 'warning', ON_TRACK: 'success', INACTIVE: 'neutral' };
export const CHANNEL_LABEL: Record<SessionChannel, string> = { WHATSAPP: 'WhatsApp call', PHONE: 'Phone call', VIDEO: 'Video call', IN_PERSON: 'In person' };
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = { SCHEDULED: 'Scheduled', DONE: 'Done', NO_SHOW: 'No-show', CANCELLED: 'Cancelled' };
export const NOTE_TAGS = ['motivation', 'skills', 'health', 'personal', 'admin'] as const;
export const SECTION_FIELDS = [
  { key: 'howTheyAreDoing', label: 'How they’re doing', placeholder: 'Energy, mood, what’s going on in their life' },
  { key: 'wins', label: 'Wins', placeholder: 'What went well since last time' },
  { key: 'challenges', label: 'Challenges', placeholder: 'What got in the way' },
  { key: 'agreed', label: 'What we agreed', placeholder: 'Decisions and next steps (add action items below)' },
  { key: 'nextSession', label: 'Next session', placeholder: 'When, and what to look at' },
] as const;
export type SectionKey = (typeof SECTION_FIELDS)[number]['key'];
export type Sections = Partial<Record<SectionKey, string>>;

export interface BoardClient {
  id: string;
  name: string;
  timezone: string;
  status: ClientStatus;
  reasons: string[];
  today: { planned: number; completed: number; percentage: number };
  checkIn: CheckInStatus | 'NONE';
  streak: number;
  trend: { date: string; score: number; band: Band }[];
  topBlocker: { reason: string; label: string; count: number } | null;
  lastActiveAt: string | null;
  reviewedToday: boolean;
  lastContactAt: string | null;
  noContactFlag: boolean;
  openActions: number;
  nextSessionAt: string | null;
}

export interface Board {
  date: string;
  total: number;
  reviewed: number;
  counts: Record<ClientStatus, number>;
  clients: BoardClient[];
  pending: { assignmentId: string; clientId: string; name: string; requestedAt: string }[];
}

export interface ClientOverview {
  client: {
    id: string;
    name: string;
    timezone: string;
    memberSince: string;
    lastActiveAt: string | null;
    isActive: boolean;
    mentor: { id: string; name: string; since: string } | null;
    whatsapp: { available: boolean; phone: string | null };
  };
  status: ClientStatus;
  reasons: string[];
  today: { planned: number; completed: number; percentage: number };
  checkInToday: CheckInStatus | 'NONE';
  streak: { current: number; longest: number };
  topBlocker: { label: string; count: number } | null;
  reviewedToday: boolean;
  goal: { goal: GoalDetail; windowDays: number; commitments: { commitmentId: string; title: string; active: boolean; planned: number; completed: number; completionRate: number | null }[] } | null;
  strip: DaySummary[];
  missed: { id: string; date: string; title: string; status: string; completionPercentage: number; blockers: string[]; blockerNote: string | null }[];
  checkIns: { date: string; status: CheckInStatus; completionPercentage: number; confidence: number | null; mood: number | null; blockers: string[]; reflection: string | null; reflectionPrivate: boolean }[];
  evidence: (EvidenceItem & { taskTitle: string; date: string })[];
}

export type ClientDay = DayDetail;

export interface TimelineEvent {
  id: string;
  type: string;
  at: string;
  title: string;
  detail?: string | null;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface ActionItem {
  id: string;
  clientId: string;
  owner: ActionOwner;
  title: string;
  dueDate: string | null;
  status: ActionStatus;
  overdue: boolean;
  noteId: string | null;
  doneAt: string | null;
  createdAt: string;
}

export interface AgendaItem {
  id: string;
  text: string;
  done: boolean;
}

export interface MentorSession {
  id: string;
  clientId: string;
  clientName?: string;
  mentorId: string;
  mentorName?: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  channel: SessionChannel;
  link: string | null;
  status: SessionStatus;
  agenda: AgendaItem[];
  seriesId: string | null;
  reminderLeadMin: number;
  hasNote?: boolean;
  noteId?: string | null;
  clientTimezone?: string;
}

export interface Note {
  id: string;
  clientId: string;
  kind: 'SESSION' | 'QUICK';
  sessionId: string | null;
  sections: Sections;
  text: string;
  tags: string[];
  pinned: boolean;
  isDraft: boolean;
  sharedSummary: string | null;
  sharedAt: string | null;
  archived: boolean;
  version: number;
  author: { id: string; name: string };
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
  actions: { id: string; owner: ActionOwner; title: string; status: ActionStatus; dueDate: string | null }[];
}

export interface NoteVersion {
  version: number;
  text: string;
  sections: Sections;
  tags: string[];
  sharedSummary: string | null;
  replacedBy: string;
  replacedAt: string;
}

export interface TalkingPoint {
  id: string;
  kind: 'CELEBRATE' | 'FOLLOW_UP' | 'EXPLORE' | 'ADJUST';
  text: string;
  because: string;
}

export interface Prep {
  client: { id: string; name: string; timezone: string };
  session: MentorSession | null;
  period: { from: string; to: string; days: number; since: 'LAST_SESSION' | 'DEFAULT'; lastSessionAt: string | null };
  numbers: {
    completion: number | null;
    completionBefore: number | null;
    activeDays: number;
    successfulDays: number;
    checkInsDone: number;
    checkInsMissed: number;
    streak: number;
    longestStreak: number;
    confidence: { date: string; value: number }[];
    mood: { date: string; value: number }[];
  };
  wins: string[];
  struggles: { missedByCommitment: { title: string; missed: number; dates: string[] }[]; blockers: { reason: string; label: string; count: number }[]; lowConfidenceDays: string[] };
  reflections: { date: string; text: string | null; private: boolean }[];
  actions: ActionItem[];
  recentNotes: { id: string; kind: string; pinned: boolean; text: string; createdAt: string }[];
  talkingPoints: TalkingPoint[];
}

export interface NudgeTemplate {
  key: string;
  label: string;
  body: string;
}

export interface NudgeRecord {
  id: string;
  template: string;
  body: string;
  sentAt: string;
  respondedAt: string | null;
  automatic: boolean;
}

export interface NudgeRule {
  id: string;
  condition: 'NO_CHECKIN_BY' | 'MISSED_TASK_DAYS' | 'INACTIVE_DAYS';
  params: { time?: string; days?: number };
  message: string;
  active: boolean;
  summary: string;
  lastFiredOn: string | null;
}

export interface ReportMetrics {
  weekStart: string;
  weekEnd: string;
  consistency: number | null;
  completionRate: number | null;
  tasksPlanned: number;
  tasksCompleted: number;
  checkIns: number;
  checkInDays: number;
  score: number | null;
  sessionsHeld: number;
  actionsDone: number;
  actionsOpen: number;
  streak: number;
  commitments: { title: string; planned: number; completed: number; completionRate: number }[];
  topBlockers: { label: string; count: number }[];
}

export interface WeeklyReport {
  id: string;
  clientId: string;
  weekStart: string;
  metrics: ReportMetrics;
  mentorComment: string | null;
  sharedAt: string | null;
  updatedAt: string;
}

export interface MyDay {
  date: string;
  sessions: { id: string; clientId: string; clientName: string; startsAt: string; durationMin: number; channel: SessionChannel; link: string | null; status: SessionStatus }[];
  followUps: { id: string; clientId: string; clientName: string; title: string; dueDate: string | null; overdue: boolean }[];
  overdueClientActions: { id: string; clientId: string; clientName: string; title: string; dueDate: string | null }[];
  notReviewed: { id: string; name: string }[];
  alerts: { id: string; title: string; body: string; link: string | null; clientId: string | null; createdAt: string }[];
}

// ── Client side ──────────────────────────────────────────────────────

export interface MyMentor {
  assignment: {
    id: string;
    status: 'PENDING' | 'ACTIVE';
    selfSelected: boolean;
    mentor: { id: string; name: string; bio: string | null; headline: string | null; focusAreas: GoalCategory[]; languages: string[] };
    since: string;
    requestedAt: string;
    nextSession: { startsAt: string; channel: SessionChannel } | null;
    openActions: number;
  } | null;
  whatsapp: { optIn: boolean; phone: string | null };
}

export interface MentorUpdates {
  summaries: { id: string; from: string; text: string; sharedAt: string }[];
  reports: { id: string; weekStart: string; metrics: ReportMetrics; mentorComment: string | null; sharedAt: string }[];
  messages: { id: string; from: string; body: string; sentAt: string }[];
}

export interface MySession {
  id: string;
  mentorName?: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  channel: SessionChannel;
  link: string | null;
  status: SessionStatus;
}

export interface DirectoryMentor {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  focusAreas: GoalCategory[];
  languages: string[];
  spotsLeft: number;
  available: boolean;
  matches: GoalCategory[];
  activeClients: number;
  memberSince: string;
  current: boolean;
}

export interface MentorProfile {
  headline: string | null;
  bio: string | null;
  focusAreas: GoalCategory[];
  languages: string[];
  acceptingClients: boolean;
  capacity: number;
  activeClients: number;
  /** Visible in the client directory (accepting clients and has a headline or bio). */
  listed: boolean;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

// ── Admin ────────────────────────────────────────────────────────────

export interface AdminOverview {
  date: string;
  clients: number;
  mentors: number;
  unassigned: number;
  pendingAssignments: number;
  mentored: number;
  pendingInvites: number;
  checkInsToday: number;
  missedCheckInsYesterday: number;
  needsAttention: number;
  statusCounts: Record<ClientStatus, number>;
}

export interface AdminMentor {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  capacity: number;
  activeClients: number;
  pendingClients: number;
  lastActiveAt: string | null;
  joinedAt: string;
}

export interface AdminClient {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  timezone: string;
  joinedAt: string;
  lastActiveAt: string | null;
  status: ClientStatus;
  reasons: string[];
  streak: number;
  assignment: { id: string; status: 'PENDING' | 'ACTIVE'; mentor: { id: string; name: string }; since: string } | null;
}

export interface AssignmentHistory {
  client: { id: string; name: string; email: string; isActive: boolean; createdAt: string };
  assignments: { id: string; mentor: { id: string; name: string }; status: string; assignedBy: string | null; createdAt: string; acceptedAt: string | null; endedAt: string | null; endedBy: string | null; endReason: string | null; note: string | null }[];
}

export interface Invite {
  id: string;
  email: string;
  name: string;
  status: 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  inviteUrl?: string;
}

export interface MentorActivity {
  mentor: { id: string; name: string; email: string; isActive: boolean; capacity: number; lastActiveAt: string | null; joinedAt: string };
  windowDays: number;
  activeClients: number;
  sessionsHeld: number;
  sessionsNoShow: number;
  sessionsCancelled: number;
  notesWritten: number;
  nudgesSent: number;
  automaticNudges: number;
  nudgeResponseRate: number | null;
  nudgeResponseWindowHours: number;
  alerts: number;
  alertsActedOn: number;
  medianResponseMinutes: number | null;
  overdueFollowUps: number;
  clientsAverageConsistency: number | null;
  clients: { id: string; name: string; consistency: number | null; since: string }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  subject: { id: string; name: string } | null;
  actor: { id: string; name: string; role: string } | null;
}

// ── Formatting ───────────────────────────────────────────────────────

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.round((now - new Date(iso).getTime()) / 60_000);
  const future = diff < 0;
  const m = Math.abs(diff);
  const text = m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 60)} h` : `${Math.round(m / (60 * 24))} d`;
  if (text === 'just now') return text;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatDateTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

export const firstName = (name: string) => name.split(' ')[0];

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> → ISO, in the browser's timezone. */
export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

export function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
