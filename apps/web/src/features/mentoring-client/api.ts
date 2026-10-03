'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, put } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { ActionItem, DirectoryMentor, MentorUpdates, MyMentor, MySession } from '@/lib/mentoring';

export function useMyMentor() {
  return useQuery({ queryKey: qk.myMentor, queryFn: ({ signal }) => get<MyMentor>('/me/mentor', signal) });
}

export function useMentorUpdates(enabled: boolean) {
  return useQuery({ queryKey: qk.mentorUpdates, enabled, queryFn: ({ signal }) => get<MentorUpdates>('/me/mentor-updates', signal) });
}

export function useMySessions(enabled: boolean) {
  return useQuery({ queryKey: qk.mySessions, enabled, queryFn: ({ signal }) => get<MySession[]>('/me/sessions', signal) });
}

export function useMyActions(enabled: boolean) {
  return useQuery({ queryKey: qk.myActions, enabled, queryFn: ({ signal }) => get<ActionItem[]>('/me/actions', signal) });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qk.myMentor, qk.mentorUpdates, qk.mySessions, qk.myActions, qk.notifications].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useAnswerMentorRequest() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (answer: 'accept' | 'decline') => post(`/me/mentor/${answer}`), onSuccess: refresh });
}

export function useStopSharing() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => post('/me/mentor/stop'), onSuccess: refresh });
}

export function useSetWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { optIn: boolean; phone?: string | null }) => put<MyMentor>('/me/mentor/whatsapp', v),
    onSuccess: (data) => qc.setQueryData(qk.myMentor, data),
  });
}

export function useTickAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; done: boolean }) => patch<ActionItem>(`/me/actions/${v.id}`, { status: v.done ? 'DONE' : 'OPEN' }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.myActions });
      const prev = qc.getQueryData<ActionItem[]>(qk.myActions);
      if (prev) qc.setQueryData<ActionItem[]>(qk.myActions, prev.map((a) => (a.id === v.id ? { ...a, status: v.done ? 'DONE' : 'OPEN' } : a)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.myActions, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.myActions }),
  });
}

export function useMentorDirectory(enabled: boolean) {
  return useQuery({ queryKey: [...qk.myMentor, 'directory'], enabled, staleTime: 30_000, queryFn: ({ signal }) => get<DirectoryMentor[]>('/me/mentors', signal) });
}

export function useChooseMentor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { mentorId: string; message?: string }) => post<MyMentor>('/me/mentor/choose', v),
    onSuccess: (data) => {
      qc.setQueryData(qk.myMentor, data);
      [qk.mentorUpdates, qk.mySessions, qk.myActions, qk.notifications].forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },
    // Availability may have changed (someone else took the last spot): refresh the directory either way.
    onSettled: () => qc.invalidateQueries({ queryKey: [...qk.myMentor, 'directory'] }),
  });
}
