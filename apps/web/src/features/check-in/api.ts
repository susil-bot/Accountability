'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { CheckInView, Occurrence } from '@/lib/types';
import type { buildPayload } from './model';

export interface CheckInToday {
  date: string;
  checkIn: CheckInView;
  schedule: { window: CheckInView['window']; closesAt: string };
  items: Occurrence[];
}

export interface CheckInResult {
  day: { completionPercentage: number; completedCount: number; plannedCount: number; dailyScore: number; isSuccessful: boolean };
  streak: { current: number; longest: number; previous: number };
  feedback: { headline: string; detail: string };
}

export function useCheckInToday() {
  return useQuery({ queryKey: qk.checkinToday, queryFn: ({ signal }) => get<CheckInToday>('/checkins/today', signal) });
}

export function useSubmitCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) => post<CheckInResult>('/checkins', payload),
    // A check-in changes the day, the streak, analytics and notifications.
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' }),
  });
}
