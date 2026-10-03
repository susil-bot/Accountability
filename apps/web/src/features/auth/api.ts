'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { Me, NotificationPreference } from '@/lib/types';

export interface LoginInput {
  email: string;
  password: string;
}
export interface RegisterInput extends LoginInput {
  name: string;
  timezone: string;
}
export interface ProfileInput {
  name: string;
  timezone: string;
  checkInTime: string;
  restDays: number[];
}

/** The signed-in user, or `null` when signed out (the session probe answers 200 either way). */
export function useSession(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.me,
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
    queryFn: ({ signal }) => get<Me | null>('/auth/session', signal),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: LoginInput) => post<{ user: Me }>('/auth/login', v),
    onSuccess: ({ user }) => qc.setQueryData(qk.me, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: RegisterInput) => post<{ user: Me }>('/auth/register', v),
    onSuccess: ({ user }) => qc.setQueryData(qk.me, user),
  });
}

/** Sign out (this device or all devices), clear every cached query and leave the app. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (all: boolean = false) => post(all ? '/auth/logout-all' : '/auth/logout'),
    onSettled: () => {
      qc.clear();
      window.location.replace('/login');
    },
  });
}

export interface InvitePreview {
  name: string;
  email: string;
  expiresAt: string;
}

export function useInvitePreview(token: string | null) {
  return useQuery({
    queryKey: ['invite', token],
    enabled: !!token,
    retry: false,
    queryFn: ({ signal }) => get<InvitePreview>(`/auth/invite?token=${encodeURIComponent(token ?? '')}`, signal),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { token: string; password: string; timezone: string; name?: string }) => post<{ user: Me }>('/auth/accept-invite', v),
    onSuccess: ({ user }) => qc.setQueryData(qk.me, user),
  });
}

export function useMarkOnboarded() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => post<Me>('/users/me/onboarded'), onSuccess: (me) => qc.setQueryData(qk.me, me) });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<ProfileInput>) => patch<Me>('/users/me', v),
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me);
      // Timezone / rest days change what "today" is → everything date-based is stale.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<NotificationPreference>) => patch<NotificationPreference>('/notification-preferences', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}
