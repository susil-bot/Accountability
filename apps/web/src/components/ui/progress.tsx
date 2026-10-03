import { cn } from '@/lib/utils';

export interface ProgressProps {
  /** 0–100; values outside are clamped. */
  value: number;
  /** Accessible name, e.g. "Today’s completion". Required: a bare progressbar is meaningless to screen readers. */
  label: string;
  tone?: 'primary' | 'success' | 'warning';
  className?: string;
}

const BAR = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning' } as const;

export function Progress({ value, label, tone = 'primary', className }: ProgressProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', BAR[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Maps a completion percentage to the product's consistency colours (≥80 good, ≥50 watch). */
export const toneForPercentage = (pct: number): ProgressProps['tone'] => (pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'primary');
