'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post, putToSignedUrl } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useToast } from '@/components/ui/toast';
import type { Dashboard, EvidenceItem, Occurrence } from '@/lib/types';
import { prepareUpload } from './image-compress';

export type TaskAction = { occ: Occurrence; kind: 'complete' | 'partial' | 'miss' | 'reset' | 'progress'; value?: number };
type TaskResult = {
  occurrence: Occurrence;
  day: { completionPercentage: number; completedCount: number; plannedCount: number; dailyScore: number } | null;
  streak: { current: number; longest: number };
};

function callTask({ occ, kind, value }: TaskAction) {
  const base = `/task-occurrences/${occ.id}`;
  switch (kind) {
    case 'complete':
      return post<TaskResult>(`${base}/complete`, value !== undefined ? { actualValue: value } : {});
    case 'partial':
      return post<TaskResult>(`${base}/partial`, { actualValue: value });
    case 'miss':
      return post<TaskResult>(`${base}/miss`);
    case 'reset':
      return post<TaskResult>(`${base}/reset`);
    case 'progress':
      return patch<TaskResult>(base, { actualValue: value });
  }
}

/**
 * Task updates. The UI shows a "saving" state immediately but only shows a new status once the
 * server confirms it (spec §49–50); failures surface a Retry action.
 */
export function useTaskMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: callTask,
    onSuccess: (res) => {
      qc.setQueryData<Dashboard>(qk.dashboard, (d) => {
        if (!d) return d;
        const items = d.today.items.map((i) => (i.id === res.occurrence.id ? res.occurrence : i));
        const day = res.day && res.day.plannedCount > 0 && d.today.date === res.occurrence.scheduledDate ? res.day : null;
        return {
          ...d,
          today: {
            ...d.today,
            items,
            ...(day ? { completionPercentage: day.completionPercentage, completedCount: day.completedCount, score: day.dailyScore } : {}),
            remainingCount: items.filter((i) => i.period === 'DAY' && (i.status === 'PENDING' || i.status === 'IN_PROGRESS')).length,
          },
          streak: { ...d.streak, current: res.streak.current, longest: res.streak.longest },
        };
      });
      qc.invalidateQueries({ queryKey: qk.dashboard });
      qc.invalidateQueries({ queryKey: qk.checkinToday });
      qc.invalidateQueries({ queryKey: qk.analytics });
    },
    onError: (e, vars) => {
      const network = e instanceof Error && 'code' in e && (e as { code: string }).code === 'NETWORK_ERROR';
      toast({ tone: 'error', message: network ? 'Your update couldn’t be saved.' : (e as Error).message, action: { label: 'Retry', onClick: () => m.mutate(vars) } });
    },
  });
  return m;
}

export function useEvidence(occId: string, enabled = true) {
  return useQuery({ queryKey: qk.evidence(occId), queryFn: ({ signal }) => get<EvidenceItem[]>(`/task-occurrences/${occId}/evidence`, signal), enabled });
}

type UploadTicket = { key: string; uploadUrl: string; thumbnailKey: string | null; thumbnailUploadUrl: string | null; expiresAt: string };

export type AddEvidenceInput =
  | { kind: 'FILE'; file: File; description?: string; onProgress?: (f: number) => void }
  | { kind: 'URL'; url: string; description?: string }
  | { kind: 'TEXT'; description: string };

/** File evidence: compress on device → ask for signed upload URLs → PUT direct to storage → confirm. */
export function useAddEvidence(occId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddEvidenceInput) => {
      if (input.kind !== 'FILE') {
        return post<EvidenceItem>('/evidence', { taskOccurrenceId: occId, type: input.kind, url: input.kind === 'URL' ? input.url : undefined, description: input.description || undefined });
      }
      const prepared = await prepareUpload(input.file);
      const ticket = await post<UploadTicket>('/evidence/uploads', {
        taskOccurrenceId: occId,
        contentType: prepared.mainType,
        size: prepared.main.size,
        thumbnailContentType: prepared.thumbType ?? undefined,
        thumbnailSize: prepared.thumb?.size,
      });
      await putToSignedUrl(ticket.uploadUrl, prepared.main, prepared.mainType, input.onProgress);
      if (prepared.thumb && ticket.thumbnailUploadUrl) await putToSignedUrl(ticket.thumbnailUploadUrl, prepared.thumb, prepared.thumbType!);
      return post<EvidenceItem>('/evidence', {
        taskOccurrenceId: occId,
        type: prepared.mainType === 'application/pdf' ? 'FILE' : 'IMAGE',
        uploadKey: ticket.key,
        thumbnailKey: ticket.thumbnailKey ?? undefined,
        originalName: prepared.name,
        description: input.description || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.evidence(occId) });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useDeleteEvidence(occId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/evidence/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.evidence(occId) });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}
