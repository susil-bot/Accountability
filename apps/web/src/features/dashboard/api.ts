'use client';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { Dashboard } from '@/lib/types';

/** One aggregated request for the whole screen (spec §76). Also triggers the server's lazy catch-up. */
export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: ({ signal }) => get<Dashboard>('/dashboard', signal) });
}
