'use client';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, put } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type {
  ActionItem, ActionStatus, AgendaItem, MentorProfile, Board, ClientDay, ClientOverview, MentorSession, MyDay, Note, NoteVersion, NudgeRecord, NudgeRule, NudgeTemplate, Prep, Sections,
  SessionChannel, SessionStatus, TimelineEvent, WeeklyReport,
} from '@/lib/mentoring';

/** After any mentor write, everything mentor-side may have changed (board counts, timeline, prep). */
function useRefreshMentor() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.mentor });
}

// ── Board, My day, client page ───────────────────────────────────────

export function useBoard() {
  return useQuery({ queryKey: qk.board, queryFn: ({ signal }) => get<Board>('/mentor/clients', signal), refetchInterval: 5 * 60_000 });
}

export function useMyDay() {
  return useQuery({ queryKey: qk.myDay, queryFn: ({ signal }) => get<MyDay>('/mentor/my-day', signal), refetchInterval: 5 * 60_000 });
}

export function useClientOverview(id: string | null) {
  return useQuery({ queryKey: qk.mentorClient(id ?? ''), enabled: !!id, queryFn: ({ signal }) => get<ClientOverview>(`/mentor/clients/${id}`, signal) });
}

export function useClientDay(id: string, date: string | null) {
  return useQuery({ queryKey: qk.clientDay(id, date ?? ''), enabled: !!date, queryFn: ({ signal }) => get<ClientDay>(`/mentor/clients/${id}/day/${date}`, signal) });
}

export function useTimeline(id: string) {
  return useInfiniteQuery({
    queryKey: qk.timeline(id),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      get<{ items: TimelineEvent[]; nextBefore: string | null }>(`/mentor/clients/${id}/timeline?limit=40${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`, signal),
    getNextPageParam: (last) => last.nextBefore,
  });
}

export function useMarkReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { clientId: string; reviewed: boolean }) => put<{ clientId: string; reviewedToday: boolean }>(`/mentor/clients/${v.clientId}/reviewed`, { reviewed: v.reviewed }),
    // Ticking is instant on the board; the server confirms in the background.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.board });
      const prev = qc.getQueryData<Board>(qk.board);
      if (prev) {
        const clients = prev.clients.map((c) => (c.id === v.clientId ? { ...c, reviewedToday: v.reviewed } : c));
        qc.setQueryData<Board>(qk.board, { ...prev, clients, reviewed: clients.filter((c) => c.reviewedToday).length });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.board, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.mentor }),
  });
}

export function useWhatsappLink() {
  return useMutation({ mutationFn: (v: { clientId: string; text: string }) => get<{ available: boolean; url: string | null }>(`/mentor/clients/${v.clientId}/whatsapp-link?text=${encodeURIComponent(v.text)}`) });
}

// ── Notes ────────────────────────────────────────────────────────────

export function useNotes(clientId: string, filters: { q?: string; tag?: string; archived?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.archived) params.set('archived', 'true');
  return useQuery({
    queryKey: qk.notes(clientId, filters.q, filters.tag, filters.archived),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => get<Note[]>(`/mentor/clients/${clientId}/notes?${params}`, signal),
  });
}

export function useNote(noteId: string | null) {
  return useQuery({ queryKey: qk.note(noteId ?? ''), enabled: !!noteId, queryFn: ({ signal }) => get<Note>(`/mentor/notes/${noteId}`, signal) });
}

export function useSessionNote(sessionId: string | null) {
  return useQuery({ queryKey: qk.sessionNote(sessionId ?? ''), enabled: !!sessionId, queryFn: ({ signal }) => get<Note | null>(`/mentor/sessions/${sessionId}/note`, signal) });
}

export function useNoteHistory(noteId: string | null) {
  return useQuery({ queryKey: qk.noteHistory(noteId ?? ''), enabled: !!noteId, queryFn: ({ signal }) => get<{ currentVersion: number; versions: NoteVersion[] }>(`/mentor/notes/${noteId}/history`, signal) });
}

export interface NoteInput {
  kind?: 'SESSION' | 'QUICK';
  sessionId?: string;
  sections?: Sections;
  text?: string;
  tags?: string[];
  pinned?: boolean;
  isDraft?: boolean;
  sharedSummary?: string | null;
  actions?: { owner: 'CLIENT' | 'MENTOR'; title: string; dueDate?: string | null }[];
  expectedVersion?: number;
}

export function useCreateNote(clientId: string) {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (v: NoteInput) => post<Note>(`/mentor/clients/${clientId}/notes`, v), onSuccess: refresh });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quiet, ...body }: NoteInput & { id: string; quiet?: boolean }) => {
      void quiet; // client-side only: controls cache invalidation below
      return patch<Note>(`/mentor/notes/${id}`, body);
    },
    onSuccess: (note, v) => {
      qc.setQueryData(qk.note(note.id), note);
      // Autosave keeps the editor's own cache fresh without refetching the whole workspace on every keystroke.
      if (!v.quiet) qc.invalidateQueries({ queryKey: qk.mentor });
    },
  });
}

export function usePinNote() {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (v: { id: string; pinned: boolean }) => put<Note>(`/mentor/notes/${v.id}/pin`, { pinned: v.pinned }), onSuccess: refresh });
}

export function useArchiveNote() {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (v: { id: string; archived: boolean }) => put(`/mentor/notes/${v.id}/archive`, { archived: v.archived }), onSuccess: refresh });
}

// ── Action items ─────────────────────────────────────────────────────

export function useActions(clientId: string) {
  return useQuery({ queryKey: qk.actions(clientId), queryFn: ({ signal }) => get<ActionItem[]>(`/mentor/clients/${clientId}/actions`, signal) });
}

export function useCreateAction(clientId: string) {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (v: { owner: 'CLIENT' | 'MENTOR'; title: string; dueDate?: string | null }) => post<ActionItem>(`/mentor/clients/${clientId}/actions`, v), onSuccess: refresh });
}

export function useUpdateAction() {
  const refresh = useRefreshMentor();
  return useMutation({
    mutationFn: (v: { id: string; status?: ActionStatus; title?: string; dueDate?: string | null }) => {
      const { id, ...body } = v;
      return patch<ActionItem>(`/mentor/actions/${id}`, body);
    },
    onSuccess: refresh,
  });
}

// ── Sessions ─────────────────────────────────────────────────────────

export function useSessions(range: { from: string; to: string; clientId?: string }) {
  const params = new URLSearchParams({ from: range.from, to: range.to, ...(range.clientId ? { clientId: range.clientId } : {}) });
  return useQuery({ queryKey: qk.sessions(params.toString()), placeholderData: keepPreviousData, queryFn: ({ signal }) => get<MentorSession[]>(`/mentor/sessions?${params}`, signal) });
}

export function useMentorSession(id: string | null) {
  return useQuery({ queryKey: qk.session(id ?? ''), enabled: !!id, queryFn: ({ signal }) => get<MentorSession>(`/mentor/sessions/${id}`, signal) });
}

export interface NewSession {
  clientId: string;
  startsAt: string;
  durationMin: number;
  channel: SessionChannel;
  link?: string | null;
  repeatWeeks?: number;
  reminderLeadMin: number;
}

export function useCreateSession() {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (v: NewSession) => post<MentorSession[]>('/mentor/sessions', v), onSuccess: refresh });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; startsAt?: string; durationMin?: number; channel?: SessionChannel; link?: string | null; status?: SessionStatus; agenda?: AgendaItem[]; reminderLeadMin?: number }) => {
      const { id, ...body } = v;
      return patch<MentorSession>(`/mentor/sessions/${id}`, body);
    },
    onSuccess: (s) => {
      qc.setQueryData(qk.session(s.id), (old: MentorSession | undefined) => (old ? { ...old, ...s } : s));
      qc.invalidateQueries({ queryKey: qk.mentor });
    },
  });
}

// ── Prep sheet ───────────────────────────────────────────────────────

export function usePrep(input: { clientId?: string | null; sessionId?: string | null }) {
  const key = input.sessionId ? `s:${input.sessionId}` : `c:${input.clientId}`;
  return useQuery({
    queryKey: qk.prep(key),
    enabled: !!(input.sessionId || input.clientId),
    queryFn: ({ signal }) => get<Prep>(`/mentor/prep?${input.sessionId ? `sessionId=${input.sessionId}` : `clientId=${input.clientId}`}`, signal),
  });
}

// ── Nudges and rules ─────────────────────────────────────────────────

export function useNudgeTemplates() {
  return useQuery({ queryKey: qk.nudgeTemplates, staleTime: Infinity, queryFn: ({ signal }) => get<NudgeTemplate[]>('/mentor/nudge-templates', signal) });
}

export function useNudges(clientId: string) {
  return useQuery({ queryKey: qk.nudges(clientId), queryFn: ({ signal }) => get<NudgeRecord[]>(`/mentor/clients/${clientId}/nudges`, signal) });
}

export function useSendNudge(clientId: string) {
  const refresh = useRefreshMentor();
  return useMutation({
    mutationFn: (v: { template: string; body?: string }) => post<{ id: string; body: string; sentAt: string; whatsappUrl: string | null }>(`/mentor/clients/${clientId}/nudges`, v),
    onSuccess: refresh,
  });
}

export function useRules(clientId: string) {
  return useQuery({ queryKey: qk.rules(clientId), queryFn: ({ signal }) => get<NudgeRule[]>(`/mentor/clients/${clientId}/rules`, signal) });
}

export function useCreateRule(clientId: string) {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (v: { condition: NudgeRule['condition']; time?: string; days?: number; message: string }) => post<NudgeRule>(`/mentor/clients/${clientId}/rules`, v), onSuccess: refresh });
}

export function useUpdateRule() {
  const refresh = useRefreshMentor();
  return useMutation({
    mutationFn: (v: { id: string; active?: boolean; time?: string; days?: number; message?: string }) => {
      const { id, ...body } = v;
      return patch<NudgeRule>(`/mentor/rules/${id}`, body);
    },
    onSuccess: refresh,
  });
}

// ── Weekly reports ───────────────────────────────────────────────────

export function useReports(clientId: string) {
  return useQuery({ queryKey: qk.reports(clientId), queryFn: ({ signal }) => get<WeeklyReport[]>(`/mentor/clients/${clientId}/reports`, signal) });
}

export function useRefreshReport(clientId: string) {
  const refresh = useRefreshMentor();
  return useMutation({ mutationFn: (weekStart: string) => post<WeeklyReport>(`/mentor/clients/${clientId}/reports/refresh`, { weekStart }), onSuccess: refresh });
}

export function useUpdateReport() {
  const refresh = useRefreshMentor();
  return useMutation({
    mutationFn: (v: { id: string; mentorComment?: string | null; share?: boolean }) => {
      const { id, ...body } = v;
      return patch<WeeklyReport>(`/mentor/reports/${id}`, body);
    },
    onSuccess: refresh,
  });
}

// ── Directory profile ────────────────────────────────────────────────

export function useMentorProfile(enabled = true) {
  return useQuery({ queryKey: [...qk.mentor, 'profile'], enabled, queryFn: ({ signal }) => get<MentorProfile>('/mentor/profile', signal) });
}

export function useUpdateMentorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<Pick<MentorProfile, 'headline' | 'bio' | 'focusAreas' | 'languages' | 'acceptingClients'>>) => patch<MentorProfile>('/mentor/profile', v),
    onSuccess: (p) => qc.setQueryData([...qk.mentor, 'profile'], p),
  });
}
