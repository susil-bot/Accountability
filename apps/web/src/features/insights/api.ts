'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { WeekAnalytics } from '@/lib/types';

export function useWeek(date?: string) {
  return useQuery({ queryKey: qk.week(date), queryFn: ({ signal }) => get<WeekAnalytics>(`/analytics/week${date ? `?date=${date}` : ''}`, signal), placeholderData: (prev) => prev });
}
