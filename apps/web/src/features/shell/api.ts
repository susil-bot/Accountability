'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { NotificationItem } from '@/lib/types';

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: ({ signal }) => get<{ items: NotificationItem[]; unread: number }>('/notifications?limit=20', signal),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`),
    // Mark as read is safe to show optimistically (spec §49).
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueryData<{ items: NotificationItem[]; unread: number }>(qk.notifications);
      if (prev) {
        qc.setQueryData(qk.notifications, {
          items: prev.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
          unread: Math.max(0, prev.unread - 1),
        });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(qk.notifications, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}
