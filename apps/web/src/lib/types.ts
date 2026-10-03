export type Role = 'USER' | 'MENTOR' | 'ADMIN';
export type Unit = 'COUNT' | 'MINUTES' | 'HOURS' | 'PERCENTAGE' | 'BOOLEAN' | 'DISTANCE' | 'CURRENCY' | 'CUSTOM';
export type OccurrenceStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'MISSED' | 'SKIPPED';
export type CheckInStatus = 'PENDING' | 'COMPLETED' | 'MISSED' | 'LATE';
export type GoalStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
export type GoalCategory = 'CAREER' | 'STUDY' | 'FITNESS' | 'HEALTH' | 'FINANCE' | 'BUSINESS' | 'PERSONAL' | 'CODING' | 'OTHER';
export type Band = 'GREEN' | 'AMBER' | 'RED' | 'NONE' | 'REST' | 'FUTURE';

export interface NotificationPreference {
  emailEnabled: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  taskReminderEnabled: boolean;
  checkinReminderEnabled: boolean;
  weeklyReviewEnabled: boolean;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
  avatarUrl: string | null;
  checkInTime: string;
  restDays: number[];
  onboarded: boolean;
  plan: 'FREE' | 'PRO' | 'COACH';
  phone?: string | null;
  mentorWhatsappOptIn?: boolean;
  notificationPreference: NotificationPreference | null;
}

export interface Occurrence {
  id: string;
  taskId: string;
  commitmentId: string;
  goalId: string;
  title: string;
  period: 'DAY' | 'WEEK';
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  preferredTime: string | null;
  status: OccurrenceStatus;
  targetValue: number;
  targetUnit: Unit;
  unitLabel: string | null;
  actualValue: number | null;
  completionPercentage: number;
  requiresEvidence: boolean;
  evidenceCount: number;
  completedAt: string | null;
  completedLate: boolean;
  missedAt: string | null;
  editable: boolean;
  dayOpen: boolean;
}

export interface RecurrenceRule {
  type: 'DAILY' | 'WEEKLY_DAYS' | 'TIMES_PER_WEEK' | 'MONTHLY';
  days?: string[];
  timesPerWeek?: number;
  dayOfMonth?: number;
}

export interface Commitment {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  frequency: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  recurrence: RecurrenceRule | null;
  schedule: string;
  targetValue: number;
  targetUnit: Unit;
  customUnitLabel: string | null;
  preferredTime: string | null;
  evidenceRequired: boolean;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  resumeAt: string | null;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  motivation: string | null;
  successMeasure: string | null;
  category: GoalCategory;
  status: GoalStatus;
  isPrimary: boolean;
  startDate: string;
  targetDate: string | null;
  daysRemaining: number | null;
  targetValue: number | null;
  targetUnit: Unit | null;
  progressCommitmentId: string | null;
  progress: { type: 'NUMERIC' | 'MANUAL'; current?: number; target?: number; percentage?: number; completed: boolean };
  notes: string | null;
  readOnly: boolean;
  commitmentCount?: number;
  completedAt: string | null;
}

export interface GoalDetail extends Goal {
  commitments: Commitment[];
}

export interface CheckInView {
  id?: string;
  date?: string;
  status: CheckInStatus;
  completedAt?: string | null;
  completionPercentage?: number;
  blockers?: string[];
  blockerNote?: string | null;
  confidence?: number | null;
  mood?: number | null;
  reflection?: string | null;
  reflectionPrivate?: boolean;
  scheduledAt: string;
  followUpAt: string;
  closesAt: string;
  window: 'BEFORE_REMINDER' | 'OPEN' | 'FOLLOW_UP' | 'CLOSED';
}

export interface Dashboard {
  user: { name: string; firstName: string; greeting: string; timezone: string; checkInTime: string };
  date: string;
  goal: Goal | null;
  hasAnyGoal: boolean;
  today: {
    date: string;
    isRestDay: boolean;
    items: Occurrence[];
    plannedCount: number;
    completedCount: number;
    remainingCount: number;
    completionPercentage: number;
    score: number;
    checkIn: CheckInView;
  };
  yesterday: null | {
    date: string;
    plannedCount: number;
    completedCount: number;
    completionPercentage: number;
    isSuccessful: boolean;
    checkInStatus: CheckInStatus;
    missed: { id: string; title: string; status: OccurrenceStatus; completionPercentage: number }[];
  };
  streak: { current: number; longest: number; previous: number; lastSuccessfulDate: string | null; broken: boolean };
  week: { weekStart: string; completion: number | null; score: number | null; checkIns: number; checkInDays: number; days: { date: string; score: number; completion: number; band: Band; isToday: boolean }[] };
  notifications: { unread: number };
  nextAction: { type: 'CREATE_GOAL' | 'ACTIVATE_GOAL' | 'COMPLETE_TASKS' | 'CHECK_IN' | 'DONE' | 'REST'; label: string };
}

export interface DaySummary {
  date: string;
  isFuture: boolean;
  isToday: boolean;
  plannedCount: number;
  completedCount: number;
  partialCount: number;
  missedCount: number;
  completionPercentage: number;
  dailyScore: number;
  checkInCompleted: boolean;
  isRestDay: boolean;
  isSuccessful: boolean;
  streakDay: number;
  band: Band;
}

export interface WeekAnalytics {
  weekStart: string;
  weekEnd: string;
  days: DaySummary[];
  tasksPlanned: number;
  tasksCompleted: number;
  completionRate: number | null;
  checkIns: number;
  checkInDays: number;
  activeDays: number;
  score: number | null;
  commitments: { commitmentId: string; title: string; planned: number; completed: number; missed: number; completionRate: number }[];
  blockers: { reason: string; count: number }[];
}

export interface MonthAnalytics {
  month: string;
  days: DaySummary[];
  activeDays: number;
  successfulDays: number;
  consistency: number | null;
  averageScore: number | null;
  averageCompletion: number | null;
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  previousMonth: string;
  nextMonth: string | null;
}

export interface DayDetail extends DaySummary {
  checkIn: (Omit<CheckInView, 'followUpAt' | 'closesAt' | 'window'> & { date: string }) | null;
  tasks: (Occurrence & { evidence: { id: string; type: string; description: string | null; url: string | null; originalName: string | null }[] })[];
}

export interface EvidenceItem {
  id: string;
  type: 'IMAGE' | 'FILE' | 'URL' | 'TEXT';
  url: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  originalName: string | null;
  submittedAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  readAt: string | null;
  createdAt: string;
}
