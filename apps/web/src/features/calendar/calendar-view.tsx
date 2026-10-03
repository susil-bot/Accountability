'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, FileText, Link2 } from 'lucide-react';
import { useDay, useMonth } from './api';
import { errorMessage } from '@/lib/api';
import { BLOCKERS, formatDate, progressLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Band } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusIcon, STATUS_TEXT } from '@/features/tasks';

const CELL: Record<Band, string> = {
  GREEN: 'bg-band-green text-white',
  AMBER: 'bg-band-amber text-black',
  RED: 'bg-band-red text-white',
  NONE: 'bg-band-none text-muted-foreground',
  REST: 'bg-band-none text-muted-foreground',
  FUTURE: 'border border-dashed border-input text-muted-foreground',
};
const LEGEND: { band: Band; label: string }[] = [
  { band: 'GREEN', label: '≥ 80%' },
  { band: 'AMBER', label: '50–79%' },
  { band: 'RED', label: '< 50%' },
  { band: 'NONE', label: 'No activity / rest' },
];

export function CalendarView() {
  const params = useSearchParams();
  const raw = params.get('date');
  const initialDate = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  const [month, setMonth] = useState<string | undefined>(initialDate?.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(initialDate);
  const q = useMonth(month);

  useEffect(() => {
    if (!selected && q.data) {
      const today = q.data.days.find((d) => d.isToday);
      if (today) setSelected(today.date);
    }
  }, [q.data, selected]);

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const data = q.data;
  const leading = data ? (new Date(`${data.days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => data && setMonth(data.previousMonth)} disabled={!data}>
              <ChevronLeft />
            </Button>
            <h2 className="font-semibold" aria-live="polite">
              {data ? formatDate(`${data.month}-01`, { month: 'long', year: 'numeric' }) : ' '}
            </h2>
            <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => data?.nextMonth && setMonth(data.nextMonth)} disabled={!data?.nextMonth}>
              <ChevronRight />
            </Button>
          </div>
          {!data ? (
            <Skeleton className="h-72" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground" aria-hidden>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5" role="group" aria-label="Days of the month">
                {Array.from({ length: leading }).map((_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {data.days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    disabled={d.isFuture}
                    onClick={() => setSelected(d.date)}
                    aria-pressed={selected === d.date}
                    aria-label={`${formatDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.isFuture ? 'upcoming' : d.plannedCount ? `${d.completionPercentage}% complete, check-in ${d.checkInCompleted ? 'done' : 'not done'}` : d.isRestDay ? 'rest day' : 'no activity'}`}
                    className={cn(
                      'relative grid aspect-square place-items-center rounded-lg text-sm font-medium tabular transition-shadow',
                      CELL[d.band],
                      selected === d.date && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                      d.isToday && 'underline underline-offset-4',
                    )}
                  >
                    {Number(d.date.slice(8))}
                  </button>
                ))}
              </div>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {LEGEND.map((l) => (
                  <li key={l.band} className="flex items-center gap-1.5">
                    <span className={cn('size-3 rounded', CELL[l.band])} aria-hidden /> {l.label}
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-center text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Consistency</dt>
                  <dd className="font-semibold tabular">{data.consistency ?? '—'}{data.consistency !== null && '%'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Best day</dt>
                  <dd className="font-semibold">{data.bestDay ? `${formatDate(data.bestDay.date, { month: 'short', day: 'numeric' })} · ${data.bestDay.score}` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Toughest day</dt>
                  <dd className="font-semibold">{data.worstDay ? `${formatDate(data.worstDay.date, { month: 'short', day: 'numeric' })} · ${data.worstDay.score}` : '—'}</dd>
                </div>
              </dl>
            </>
          )}
        </CardContent>
      </Card>
      {selected && <DayPanel date={selected} />}
    </div>
  );
}

function DayPanel({ date }: { date: string }) {
  const q = useDay(date);
  if (q.isPending) return <Skeleton className="h-48" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <Card aria-live="polite">
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          {d.plannedCount > 0 && (
            <span className="text-sm text-muted-foreground tabular">
              {d.completionPercentage}% · score {d.dailyScore}
            </span>
          )}
        </div>
        {d.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.isRestDay ? 'Rest day.' : 'Nothing was scheduled.'}</p>
        ) : (
          <ul className="grid gap-2">
            {d.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-lg border p-3">
                <StatusIcon status={t.status} className="size-7" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_TEXT[t.status]} · {progressLabel(t.actualValue, t.targetValue, t.targetUnit, t.unitLabel)}
                    {t.completedLate && ' · completed late'}
                  </p>
                  {t.evidence.length > 0 && (
                    <ul className="mt-1.5 grid gap-1">
                      {t.evidence.map((e) => (
                        <li key={e.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {e.type === 'URL' ? <Link2 className="size-3" aria-hidden /> : <FileText className="size-3" aria-hidden />}
                          {e.url ? (
                            <a href={e.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                              {e.url}
                            </a>
                          ) : (
                            <span className="truncate">{e.description ?? e.originalName ?? e.type.toLowerCase()}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 border-t pt-4 text-sm">
          <p className="flex items-center gap-2">
            <span className="font-medium">Check-in:</span>
            {d.checkIn ? (
              <Badge tone={d.checkIn.status === 'COMPLETED' || d.checkIn.status === 'LATE' ? 'success' : d.checkIn.status === 'MISSED' ? 'neutral' : 'primary'}>
                {d.checkIn.status.charAt(0) + d.checkIn.status.slice(1).toLowerCase()}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {d.checkIn?.confidence && <span className="text-muted-foreground">· confidence {d.checkIn.confidence}/5</span>}
          </p>
          {d.checkIn?.blockers && d.checkIn.blockers.length > 0 && (
            <p className="text-muted-foreground">
              Got in the way: {d.checkIn.blockers.map((b) => BLOCKERS.find((x) => x.value === b)?.label ?? b).join(', ')}
              {d.checkIn.blockerNote && ` — “${d.checkIn.blockerNote}”`}
            </p>
          )}
          {d.checkIn?.reflection && <p className="text-muted-foreground">Went well: “{d.checkIn.reflection}”</p>}
        </div>
      </CardContent>
    </Card>
  );
}
