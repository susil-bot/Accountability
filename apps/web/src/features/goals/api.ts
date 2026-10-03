'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import type { Commitment, Goal, GoalDetail, Me, NotificationPreference, RecurrenceRule, Unit } from '@/lib/types';

export interface CommitmentPayload {
  title: string;
  recurrence: RecurrenceRule;
  targetValue: number;
  targetUnit: Unit;
  customUnitLabel?: string;
  preferredTime?: string | null;
  evidenceRequired: boolean;
}

export interface CreateGoalPayload {
  title: string;
  category: string;
  motivation?: string;
  successMeasure?: string;
  targetDate?: string;
  targetValue?: number;
  targetUnit?: Unit;
  progressCommitmentIndex?: number;
  checkInTime: string;
  restDays: number[];
  activate: boolean;
  commitments: CommitmentPayload[];
}

export interface GoalConsistency {
  windowDays: number;
  commitments: { commitmentId: string; title: string; planned: number; completed: number; completionRate: number | null }[];
}

/** Anything goal-shaped changed → goals, dashboard, analytics and the check-in screen are stale. */
function useInvalidateGoals() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => ['goals', 'dashboard', 'analytics', 'checkins'].includes(String(q.queryKey[0])) });
}

export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: ({ signal }) => get<Goal[]>('/goals', signal) });

export const useGoal = (id: string | null) =>
  useQuery({ queryKey: qk.goal(id ?? ''), queryFn: ({ signal }) => get<GoalDetail>(`/goals/${id}`, signal), enabled: !!id });

export const useGoalConsistency = (id: string | null) =>
  useQuery({ queryKey: qk.goalAnalytics(id ?? ''), queryFn: ({ signal }) => get<GoalConsistency>(`/analytics/goal/${id}`, signal), enabled: !!id });

/** Wizard submit: goal + commitments + check-in time + rest days are created atomically by the API. */
export function useCreateGoal() {
  const invalidate = useInvalidateGoals();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, notificationPreferences }: { goal: CreateGoalPayload; notificationPreferences?: Partial<NotificationPreference> }) => {
      const res = await post<{ goal: GoalDetail; warnings: string[] }>('/goals', goal);
      // Preferences are a non-critical follow-up; a failure here never loses the goal.
      if (notificationPreferences) await patch('/notification-preferences', notificationPreferences).catch(() => undefined);
      return res;
    },
    onSuccess: () => {
      // The API marks the user onboarded in the same transaction; reflect it before navigating
      // so the route guard doesn't bounce back to /onboarding on stale data.
      qc.setQueryData<Me | null>(qk.me, (m) => (m ? { ...m, onboarded: true } : m));
      invalidate();
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useUpdateGoal(id: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({ mutationFn: (v: Partial<Pick<Goal, 'title' | 'motivation' | 'successMeasure' | 'notes'>> & { targetDate?: string | null }) => patch<GoalDetail>(`/goals/${id}`, v), onSuccess: invalidate });
}

export type GoalTransition = 'activate' | 'pause' | 'resume' | 'complete';

export function useGoalTransition(id: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (t: GoalTransition) => post<GoalDetail>(`/goals/${id}/${t}`, t === 'complete' ? { confirm: true } : {}),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal(id: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({ mutationFn: () => del<{ deleted: boolean; abandoned: boolean }>(`/goals/${id}`), onSuccess: invalidate });
}

export function useSaveCommitment(goalId: string, commitmentId?: string) {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: (payload: CommitmentPayload) =>
      commitmentId
        ? patch<{ commitment: Commitment; warnings: string[] }>(`/commitments/${commitmentId}`, payload)
        : post<{ commitment: Commitment; warnings: string[] }>(`/goals/${goalId}/commitments`, payload),
    onSuccess: invalidate,
  });
}

export type CommitmentAction = 'pause' | 'resume' | 'archive';

export function useCommitmentAction() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: CommitmentAction }) => (action === 'archive' ? del(`/commitments/${id}`) : post(`/commitments/${id}/${action}`)),
    onSuccess: invalidate,
  });
}
