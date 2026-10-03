'use client';
import { ChevronRight, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, progressLabel } from '@/lib/format';
import type { Occurrence } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatusIcon, STATUS_TEXT } from './status-icon';

export function TaskRow({
  occ,
  timeZone,
  pending,
  onQuickComplete,
  onOpen,
}: {
  occ: Occurrence;
  timeZone: string;
  pending: boolean;
  onQuickComplete: () => void;
  onOpen: () => void;
}) {
  const canQuick = occ.editable && (occ.status === 'PENDING' || occ.status === 'IN_PROGRESS') && occ.period === 'DAY';
  const unit = occ.period === 'WEEK' ? 'COUNT' : occ.targetUnit;
  return (
    <li className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 pr-2', occ.status === 'SKIPPED' && 'opacity-60')}>
      <button
        type="button"
        onClick={canQuick ? onQuickComplete : onOpen}
        disabled={pending || occ.status === 'SKIPPED'}
        className="rounded-full p-0.5"
        aria-label={canQuick ? `Mark “${occ.title}” as done` : `${occ.title}: ${STATUS_TEXT[occ.status]}. Edit`}
      >
        <StatusIcon status={occ.status} pending={pending} />
      </button>
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Open ${occ.title}`}>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', occ.status === 'COMPLETED' && 'text-muted-foreground')}>{occ.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular">{occ.status === 'MISSED' ? 'Missed' : progressLabel(occ.actualValue, occ.targetValue, unit, occ.unitLabel)}</span>
            {occ.preferredTime && occ.status === 'PENDING' && <span>· {formatTime(occ.scheduledStartTime, timeZone)}</span>}
            {occ.period === 'WEEK' && <span>· this week</span>}
            {occ.requiresEvidence && occ.evidenceCount === 0 && occ.status !== 'SKIPPED' && (
              <Badge tone="warning" className="py-0">
                <Paperclip className="size-3" aria-hidden /> Evidence
              </Badge>
            )}
            {occ.completedLate && <Badge className="py-0">Late</Badge>}
          </span>
          {unit !== 'BOOLEAN' && (occ.status === 'PARTIAL' || occ.status === 'IN_PROGRESS') && (
            <Progress value={occ.completionPercentage} tone="warning" className="mt-2 h-1.5" label={`${occ.title} progress`} />
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}
