import { Check, CircleDashed, Loader2, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OccurrenceStatus } from '@/lib/types';

export const STATUS_TEXT: Record<OccurrenceStatus, string> = {
  PENDING: 'Not done yet',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  PARTIAL: 'Partial',
  MISSED: 'Missed',
  SKIPPED: 'Skipped',
};

export function StatusIcon({ status, pending, className }: { status: OccurrenceStatus; pending?: boolean; className?: string }) {
  const base = 'grid size-9 shrink-0 place-items-center rounded-full border-2';
  if (pending)
    return (
      <span className={cn(base, 'border-primary/40 text-primary', className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
      </span>
    );
  switch (status) {
    case 'COMPLETED':
      return (
        <span className={cn(base, 'border-success bg-success text-white', className)}>
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </span>
      );
    case 'PARTIAL':
    case 'IN_PROGRESS':
      return (
        <span className={cn(base, 'border-warning text-warning', className)}>
          <Minus className="size-4" strokeWidth={3} aria-hidden />
        </span>
      );
    case 'MISSED':
      return (
        <span className={cn(base, 'border-muted-foreground/40 text-muted-foreground', className)}>
          <X className="size-4" aria-hidden />
        </span>
      );
    case 'SKIPPED':
      return (
        <span className={cn(base, 'border-dashed border-muted-foreground/40 text-muted-foreground', className)}>
          <CircleDashed className="size-4" aria-hidden />
        </span>
      );
    default:
      return <span className={cn(base, 'border-input', className)} />;
  }
}
