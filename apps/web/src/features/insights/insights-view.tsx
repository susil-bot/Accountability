'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useWeek } from './api';
import { errorMessage } from '@/lib/api';
import { BLOCKERS, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, toneForPercentage } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';

const DailyScoreChart = dynamic(() => import('./daily-score-chart'), { ssr: false, loading: () => <Skeleton className="h-full" /> });

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InsightsView() {
  const [anchor, setAnchor] = useState<string | undefined>();
  const q = useWeek(anchor);

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const w = q.data;
  const isCurrent = w?.days.some((d) => d.isToday);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => w && setAnchor(shift(w.weekStart, -7))} disabled={!w}>
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
            {w ? `${formatDate(w.weekStart, { month: 'short', day: 'numeric' })} – ${formatDate(w.weekEnd, { month: 'short', day: 'numeric' })}` : ' '}
          </span>
          <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => w && setAnchor(shift(w.weekStart, 7))} disabled={!w || isCurrent}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {!w ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : w.activeDays === 0 ? (
        <EmptyState title="No activity this week" description="Once you have commitments scheduled, your weekly consistency will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Weekly score', value: w.score ?? '—' },
              { label: 'Completion', value: w.completionRate !== null ? `${w.completionRate}%` : '—' },
              { label: 'Tasks completed', value: `${w.tasksCompleted} / ${w.tasksPlanned}` },
              { label: 'Check-ins', value: `${w.checkIns} / ${w.checkInDays}` },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily scores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56" role="img" aria-label={`Daily scores: ${w.days.filter((d) => !d.isFuture).map((d) => `${formatDate(d.date, { weekday: 'short' })} ${d.dailyScore}`).join(', ')}`}>
                <DailyScoreChart days={w.days} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By commitment</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-4">
                {w.commitments.map((c) => (
                  <li key={c.commitmentId}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{c.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular">
                        {c.completionRate}% · {c.completed}/{c.planned} done{c.missed > 0 ? ` · missed ${c.missed}×` : ''}
                      </span>
                    </div>
                    <Progress value={c.completionRate} tone={toneForPercentage(c.completionRate)} label={`${c.title} completion`} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {w.blockers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What got in the way</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {w.blockers.map((b) => (
                    <li key={b.reason} className="flex justify-between">
                      <span>{BLOCKERS.find((x) => x.value === b.reason)?.label ?? b.reason}</span>
                      <span className="tabular text-muted-foreground">{b.count}×</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
