/**
 * Query-key factory. Keys live in one place because invalidation crosses features
 * (completing a task refreshes the dashboard, analytics and the check-in screen).
 */
export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  goals: ['goals'] as const,
  goal: (id: string) => ['goals', id] as const,
  goalAnalytics: (id: string) => ['analytics', 'goal', id] as const,
  analytics: ['analytics'] as const,
  week: (date?: string) => ['analytics', 'week', date ?? 'current'] as const,
  month: (m?: string) => ['analytics', 'month', m ?? 'current'] as const,
  day: (d: string) => ['analytics', 'day', d] as const,
  checkinToday: ['checkins', 'today'] as const,
  notifications: ['notifications'] as const,
  evidence: (occId: string) => ['evidence', occId] as const,

  // Mentoring (client side)
  myMentor: ['me', 'mentor'] as const,
  mentorUpdates: ['me', 'mentor-updates'] as const,
  mySessions: ['me', 'sessions'] as const,
  myActions: ['me', 'actions'] as const,

  // Mentor workspace — everything under 'mentor' is refreshed together after a write.
  mentor: ['mentor'] as const,
  board: ['mentor', 'board'] as const,
  myDay: ['mentor', 'my-day'] as const,
  mentorClient: (id: string) => ['mentor', 'client', id] as const,
  clientDay: (id: string, date: string) => ['mentor', 'client', id, 'day', date] as const,
  timeline: (id: string) => ['mentor', 'client', id, 'timeline'] as const,
  notes: (id: string, q?: string, tag?: string, archived?: boolean) => ['mentor', 'client', id, 'notes', q ?? '', tag ?? '', !!archived] as const,
  note: (noteId: string) => ['mentor', 'note', noteId] as const,
  noteHistory: (noteId: string) => ['mentor', 'note', noteId, 'history'] as const,
  actions: (id: string) => ['mentor', 'client', id, 'actions'] as const,
  sessions: (range: string) => ['mentor', 'sessions', range] as const,
  session: (id: string) => ['mentor', 'session', id] as const,
  sessionNote: (id: string) => ['mentor', 'session', id, 'note'] as const,
  prep: (key: string) => ['mentor', 'prep', key] as const,
  nudges: (id: string) => ['mentor', 'client', id, 'nudges'] as const,
  nudgeTemplates: ['mentor', 'nudge-templates'] as const,
  rules: (id: string) => ['mentor', 'client', id, 'rules'] as const,
  reports: (id: string) => ['mentor', 'client', id, 'reports'] as const,

  // Admin
  admin: ['admin'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminMentors: ['admin', 'mentors'] as const,
  adminInvites: ['admin', 'invites'] as const,
  adminClients: (filter: string, q: string) => ['admin', 'clients', filter, q] as const,
  adminHistory: (id: string) => ['admin', 'history', id] as const,
  adminActivity: (id: string) => ['admin', 'activity', id] as const,
  adminAudit: (filters: string) => ['admin', 'audit', filters] as const,
  adminPeople: ['admin', 'people'] as const,
  push: ['push'] as const,
};
