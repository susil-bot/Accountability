'use client';
import { useState } from 'react';
import { FileText, Link2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress, toneForPercentage } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { BAND_CLASS, bandLabel } from '@/lib/bands';
import { BLOCKERS, formatDate, progressLabel } from '@/lib/format';
import type { ClientOverview } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useClientDay } from './api';
import { SectionTitle, Stat } from './bits';

const CHECKIN: Record<string, string> = { COMPLETED: 'Done', LATE: 'Done late', MISSED: 'Missed', PENDING: 'Not yet', NONE: '–' };
const blockerText = (code: string) => BLOCKERS.find((b) => b.value === code)?.label ?? code;

export function OverviewTab({ d }: { d: ClientOverview }) {
  const [day, setDay] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Today" value={`${d.today.completed}/${d.today.planned}`} hint={`${d.today.percentage}% done`} />
        <Stat label="Check-in" value={CHECKIN[d.checkInToday]} />
        <Stat label="Streak" value={d.streak.current} hint={`Longest ${d.streak.longest}`} />
        <Stat label="Top blocker" value={<span className="text-base">{d.topBlocker?.label ?? 'None'}</span>} hint={d.topBlocker ? `${d.topBlocker.count}× this week` : 'this week'} />
      </div>

      <section className="grid gap-3" aria-labelledby="strip-h">
        <SectionTitle id="strip-h">Last 14 days</SectionTitle>
        <div className="grid grid-cols-7 gap-1.5 md:grid-cols-14">
          {d.strip.map((s) => (
            <button
              key={s.date}
              type="button"
              onClick={() => setDay(s.date)}
              aria-label={`${formatDate(s.date)}: ${bandLabel(s.band, s.completionPercentage)}${s.checkInCompleted ? ', checked in' : ''}`}
              className="grid gap-1 rounded-lg p-1 text-center text-[11px] text-muted-foreground hover:bg-muted"
            >
              <span className={cn('h-8 rounded-md', BAND_CLASS[s.band])} />
              <span>{formatDate(s.date, { day: 'numeric' })}</span>
            </button>
          ))}
        </div>
      </section>

      {d.goal && (
        <Card>
          <CardHeader>
            <CardTitle>{d.goal.goal.title}</CardTitle>
            {d.goal.goal.motivation && <p className="text-sm text-muted-foreground">Why: {d.goal.goal.motivation}</p>}
          </CardHeader>
          <CardContent className="grid gap-3">
            {d.goal.commitments.map((c) => (
              <div key={c.commitmentId} className="grid gap-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className={cn(!c.active && 'text-muted-foreground')}>
                    {c.title}
                    {!c.active && ' (paused)'}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.completionRate === null ? '–' : `${c.completionRate}%`} · {c.completed}/{c.planned}
                  </span>
                </div>
                <Progress value={c.completionRate ?? 0} label={`${c.title} consistency`} tone={toneForPercentage(c.completionRate ?? 0)} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Consistency over the last {d.goal.windowDays} days.</p>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3" aria-labelledby="missed-h">
        <SectionTitle id="missed-h">Missed and partial (14 days)</SectionTitle>
        {d.missed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing missed in the last 14 days.</p>
        ) : (
          <ul className="grid gap-2">
            {d.missed.slice(0, 12).map((m) => (
              <li key={m.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{m.title}</span> <span className="text-muted-foreground">· {formatDate(m.date)}</span>
                  </span>
                  <Badge tone={m.status === 'MISSED' ? 'danger' : 'warning'}>{m.status === 'MISSED' ? 'Missed' : `${m.completionPercentage}%`}</Badge>
                </div>
                {(m.blockers.length > 0 || m.blockerNote) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Why: {m.blockers.join(', ')}
                    {m.blockerNote ? ` — “${m.blockerNote}”` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="ci-h">
        <SectionTitle id="ci-h">Check-ins and reflections</SectionTitle>
        <ul className="grid gap-2">
          {d.checkIns.map((c) => (
            <li key={c.date} className="rounded-lg border bg-card px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{formatDate(c.date)}</span>
                <span className="text-xs text-muted-foreground">
                  {c.status === 'MISSED' ? 'Missed check-in' : `${c.completionPercentage}% · confidence ${c.confidence ?? '–'}/5 · mood ${c.mood ?? '–'}/5`}
                </span>
              </div>
              {c.blockers.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Blockers: {c.blockers.join(', ')}</p>}
              {c.reflectionPrivate ? (
                <p className="mt-1 flex items-center gap-1 text-xs italic text-muted-foreground">
                  <Lock className="size-3" aria-hidden /> Reflection kept private
                </p>
              ) : (
                c.reflection && <p className="mt-1">“{c.reflection}”</p>
              )}
            </li>
          ))}
          {d.checkIns.length === 0 && <li className="text-sm text-muted-foreground">No check-ins in the last 14 days.</li>}
        </ul>
      </section>

      <section className="grid gap-3" aria-labelledby="ev-h">
        <SectionTitle id="ev-h">Evidence</SectionTitle>
        {d.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence submitted yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {d.evidence.map((e) => (
              <li key={e.id} className="overflow-hidden rounded-lg border bg-card text-xs">
                {e.type === 'IMAGE' && (e.thumbnailUrl || e.url) ? (
                  <a href={e.url ?? undefined} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs; next/image can't optimise them in a static export */}
                    <img src={e.thumbnailUrl ?? e.url ?? ''} alt={e.description ?? `Evidence for ${e.taskTitle}`} className="aspect-square w-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <div className="grid h-20 place-items-center bg-muted text-muted-foreground">
                    {e.type === 'URL' ? <Link2 className="size-6" aria-hidden /> : <FileText className="size-6" aria-hidden />}
                  </div>
                )}
                <div className="p-2">
                  <p className="truncate font-medium">{e.taskTitle}</p>
                  <p className="truncate text-muted-foreground">
                    {formatDate(e.date)}
                    {e.type === 'URL' && e.url ? (
                      <>
                        {' · '}
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                          link
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DayDialog clientId={d.client.id} date={day} onClose={() => setDay(null)} />
    </div>
  );
}

function DayDialog({ clientId, date, onClose }: { clientId: string; date: string | null; onClose: () => void }) {
  const q = useClientDay(clientId, date);
  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={date ? formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) : ''}>
        {!q.data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              {q.data.completedCount}/{q.data.plannedCount} done · score {q.data.dailyScore}
              {q.data.isRestDay ? ' · rest day' : ''}
            </p>
            <ul className="grid gap-1.5">
              {q.data.tasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span>{t.title}</span>
                  <span className="text-muted-foreground">{t.status === 'MISSED' ? 'Missed' : progressLabel(t.actualValue, t.targetValue, t.targetUnit, t.unitLabel)}</span>
                </li>
              ))}
            </ul>
            {q.data.checkIn && (
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">Check-in · confidence {q.data.checkIn.confidence ?? '–'}/5</p>
                {!!q.data.checkIn.blockers?.length && <p className="text-xs text-muted-foreground">Blockers: {q.data.checkIn.blockers.map(blockerText).join(', ')}</p>}
                {q.data.checkIn.reflectionPrivate ? <p className="text-xs italic text-muted-foreground">Reflection kept private</p> : q.data.checkIn.reflection && <p className="mt-1">“{q.data.checkIn.reflection}”</p>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
