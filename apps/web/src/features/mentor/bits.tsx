'use client';
import { Badge } from '@/components/ui/badge';
import { BAND_CLASS, bandLabel } from '@/lib/bands';
import { formatDate } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE, type ClientStatus } from '@/lib/mentoring';
import type { Band } from '@/lib/types';
import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: ClientStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** Seven small bars, one per day, coloured by band and sized by score. */
export function TrendBars({ days, className }: { days: { date: string; score: number; band: Band }[]; className?: string }) {
  return (
    <div className={cn('flex h-8 items-end gap-0.5', className)} role="img" aria-label={`Last ${days.length} days: ${days.map((d) => `${formatDate(d.date)} ${bandLabel(d.band, d.score)}`).join(', ')}`}>
      {days.map((d) => (
        <span key={d.date} className={cn('w-2.5 rounded-sm', BAND_CLASS[d.band])} style={{ height: `${Math.max(12, d.band === 'NONE' || d.band === 'REST' ? 12 : d.score)}%` }} />
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'good' && 'text-success', tone === 'bad' && 'text-danger')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, id }: { children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Build a WhatsApp click-to-chat URL (only rendered when the client opted in and the API returned their number). */
export function waUrl(phone: string, text = '') {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
