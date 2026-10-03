'use client';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { AdminClient, AdminMentor, AdminOverview, AssignmentHistory, AuditEntry, Invite, MentorActivity } from '@/lib/mentoring';

function useRefreshAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.admin });
}

export function useAdminOverview() {
  return useQuery({ queryKey: qk.adminOverview, queryFn: ({ signal }) => get<AdminOverview>('/admin/overview', signal) });
}

export function useAdminMentors() {
  return useQuery({ queryKey: qk.adminMentors, queryFn: ({ signal }) => get<AdminMentor[]>('/admin/mentors', signal) });
}

export function useInvites() {
  return useQuery({ queryKey: qk.adminInvites, queryFn: ({ signal }) => get<Invite[]>('/admin/invites', signal) });
}

export function useAdminClients(filter: string, q: string) {
  const params = new URLSearchParams({ filter, ...(q ? { q } : {}) });
  return useQuery({ queryKey: qk.adminClients(filter, q), placeholderData: keepPreviousData, queryFn: ({ signal }) => get<AdminClient[]>(`/admin/clients?${params}`, signal) });
}

export function useAssignmentHistory(clientId: string | null) {
  return useQuery({ queryKey: qk.adminHistory(clientId ?? ''), enabled: !!clientId, queryFn: ({ signal }) => get<AssignmentHistory>(`/admin/clients/${clientId}/assignments`, signal) });
}

export function useMentorActivity(id: string | null) {
  return useQuery({ queryKey: qk.adminActivity(id ?? ''), enabled: !!id, queryFn: ({ signal }) => get<MentorActivity>(`/admin/mentors/${id}/activity`, signal) });
}

export function useAuditLog(filters: { userId?: string; actorId?: string; action?: string }) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][]);
  return useInfiniteQuery({
    queryKey: qk.adminAudit(params.toString()),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => get<{ items: AuditEntry[]; nextBefore: string | null }>(`/admin/audit?${params}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`, signal),
    getNextPageParam: (last) => last.nextBefore,
  });
}

export function usePeople() {
  return useQuery({ queryKey: qk.adminPeople, staleTime: 5 * 60_000, queryFn: ({ signal }) => get<{ id: string; name: string; role: string }[]>('/admin/people', signal) });
}

export function useInviteMentor() {
  const refresh = useRefreshAdmin();
  return useMutation({ mutationFn: (v: { name: string; email: string }) => post<Invite & { inviteUrl: string }>('/admin/mentors/invite', v), onSuccess: refresh });
}

export function useRevokeInvite() {
  const refresh = useRefreshAdmin();
  return useMutation({ mutationFn: (id: string) => post(`/admin/invites/${id}/revoke`), onSuccess: refresh });
}

export function useAssign() {
  const refresh = useRefreshAdmin();
  return useMutation({ mutationFn: (v: { clientId: string; mentorId: string; note?: string; overrideCapacity?: boolean }) => post('/admin/assignments', v), onSuccess: refresh });
}

export function useEndAssignment() {
  const refresh = useRefreshAdmin();
  return useMutation({ mutationFn: (id: string) => post(`/admin/assignments/${id}/end`), onSuccess: refresh });
}

export function useSetCapacity() {
  const refresh = useRefreshAdmin();
  return useMutation({ mutationFn: (v: { id: string; capacity: number }) => patch(`/admin/mentors/${v.id}/capacity`, { capacity: v.capacity }), onSuccess: refresh });
}

export function useSetActive() {
  const refresh = useRefreshAdmin();
  return useMutation({ mutationFn: (v: { id: string; active: boolean }) => post<{ endedAssignments: number }>(`/admin/users/${v.id}/active`, { active: v.active }), onSuccess: refresh });
}
