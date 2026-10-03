'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { DayDetail, MonthAnalytics } from '@/lib/types';

export function useMonth(month?: string) {
  return useQuery({ queryKey: qk.month(month), queryFn: ({ signal }) => get<MonthAnalytics>(`/analytics/month${month ? `?month=${month}` : ''}`, signal), placeholderData: (prev) => prev });
}

export function useDay(date: string | null) {
  return useQuery({ queryKey: qk.day(date ?? ''), queryFn: ({ signal }) => get<DayDetail>(`/analytics/day/${date}`, signal), enabled: !!date });
}
