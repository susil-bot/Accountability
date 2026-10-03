'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Lock, NotebookPen, Plus, Save, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { CHANNEL_LABEL, firstName, formatDateTime, type AgendaItem, type Prep, type TalkingPoint } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { usePrep, useUpdateSession } from './api';
import { SectionTitle, Stat } from './bits';

const KIND: Record<TalkingPoint['kind'], { label: string; tone: 'success' | 'primary' | 'warning' | 'neutral' }> = {
  CELEBRATE: { label: 'Celebrate', tone: 'success' },
  FOLLOW_UP: { label: 'Follow up', tone: 'primary' },
  EXPLORE: { label: 'Ask about', tone: 'warning' },
  ADJUST: { label: 'Adjust', tone: 'neutral' },
};

/** Function 20: what to talk about, built from the client's data since the last session. */
export function PrepView() {
  const params = useSearchParams();
  const sessionId = params.get('sessionId');
  const clientId = params.get('clientId');
  const q = usePrep({ sessionId, clientId });

  if (!sessionId && !clientId) return <ErrorState message="Open the prep sheet from a client or a session." />;
  if (q.isPending) return <PageSkeleton label="Preparing the prep sheet" blocks={['h-8 w-72', 'h-24', 'h-64', 'h-64']} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const p = q.data;
  const n = p.numbers;
  const delta = n.completion !== null && n.completionBefore !== null ? n.completion - n.completionBefore : null;

  return (
    <div className="grid gap-5">
      <Link href={`/mentor/clients/detail?id=${p.client.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {p.client.name}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Prep: {p.client.name}</h1>
        <p className="text-sm text-muted-foreground">
          {p.session ? `${formatDateTime(p.session.startsAt)} · ${CHANNEL_LABEL[p.session.channel]} · ` : ''}
          {p.period.since === 'LAST_SESSION' ? 'Since your last session' : `Last ${p.period.days} days`} ({formatDate(p.period.from)} – {formatDate(p.period.to)})
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Completion"
              value={n.completion === null ? '–' : `${n.completion}%`}
              hint={delta === null ? 'no earlier data' : `${delta >= 0 ? '+' : ''}${delta} vs before`}
              tone={delta === null ? undefined : delta >= 10 ? 'good' : delta <= -15 ? 'bad' : undefined}
            />
            <Stat label="Good days" value={`${n.successfulDays}/${n.activeDays}`} />
            <Stat label="Check-ins" value={n.checkInsDone} hint={n.checkInsMissed ? `${n.checkInsMissed} missed` : 'none missed'} tone={n.checkInsMissed >= 2 ? 'bad' : undefined} />
            <Stat label="Streak" value={n.streak} hint={`Longest ${n.longestStreak}`} />
          </div>

          <MiniSeries title="Confidence" points={n.confidence} />

          <Facts title="Wins" items={p.wins} empty="No standout wins this period." />
          <section className="grid gap-2">
            <SectionTitle>Struggles</SectionTitle>
            {p.struggles.missedByCommitment.length === 0 && p.struggles.blockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing missed this period.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {p.struggles.missedByCommitment.map((m) => (
                  <li key={m.title}>
                    <span className="font-medium">{m.title}</span> missed {m.missed}× ({m.dates.map((d) => formatDate(d, { day: 'numeric', month: 'short' })).join(', ')})
                  </li>
                ))}
                {p.struggles.blockers.length > 0 && <li>Blockers: {p.struggles.blockers.map((b) => `${b.label} ×${b.count}`).join(', ')}</li>}
                {p.struggles.lowConfidenceDays.length > 0 && <li>Low confidence on {p.struggles.lowConfidenceDays.map((d) => formatDate(d)).join(', ')}</li>}
              </ul>
            )}
          </section>

          <section className="grid gap-2">
            <SectionTitle>In their words</SectionTitle>
            {p.reflections.length === 0 && <p className="text-sm text-muted-foreground">No reflections this period.</p>}
            {p.reflections.map((r) => (
              <p key={r.date} className="text-sm">
                <span className="text-muted-foreground">{formatDate(r.date)}: </span>
                {r.private ? (
                  <span className="inline-flex items-center gap-1 italic text-muted-foreground">
                    <Lock className="size-3" aria-hidden /> kept private
                  </span>
                ) : (
                  `“${r.text}”`
                )}
              </p>
            ))}
          </section>

          <section className="grid gap-2">
            <SectionTitle>Action items</SectionTitle>
            {p.actions.length === 0 && <p className="text-sm text-muted-foreground">No action items.</p>}
            <ul className="grid gap-1 text-sm">
              {p.actions.map((a) => (
                <li key={a.id} className={cn(a.status === 'DONE' && 'text-muted-foreground line-through')}>
                  {a.title} <span className="text-xs text-muted-foreground">({a.owner === 'CLIENT' ? 'client' : 'you'}{a.dueDate ? `, due ${formatDate(a.dueDate)}` : ''})</span>
                  {a.overdue && <Badge tone="danger" className="ml-2">Overdue</Badge>}
                </li>
              ))}
            </ul>
          </section>

          {p.recentNotes.length > 0 && (
            <section className="grid gap-2">
              <SectionTitle>Recent notes</SectionTitle>
              {p.recentNotes.map((note) => (
                <p key={note.id} className="whitespace-pre-line rounded-lg border bg-card px-3 py-2 text-sm">
                  {note.pinned && <Badge className="mr-2">Pinned</Badge>}
                  {note.text}
                </p>
              ))}
            </section>
          )}
        </div>

        <AgendaBuilder prep={p} />
      </div>
    </div>
  );
}

function AgendaBuilder({ prep }: { prep: Prep }) {
  const update = useUpdateSession();
  const toast = useToast();
  const initial = useMemo<AgendaItem[]>(() => (prep.session?.agenda.length ? prep.session.agenda : []), [prep.session]);
  const [agenda, setAgenda] = useState<AgendaItem[]>(initial);
  const [custom, setCustom] = useState('');
  useEffect(() => setAgenda(initial), [initial]);
  const inAgenda = (id: string) => agenda.some((a) => a.id === id);
  const toggle = (tp: TalkingPoint) => setAgenda((a) => (inAgenda(tp.id) ? a.filter((x) => x.id !== tp.id) : [...a, { id: tp.id, text: tp.text, done: false }]));
  const dirty = JSON.stringify(agenda) !== JSON.stringify(initial);

  return (
    <aside className="grid content-start gap-4 lg:sticky lg:top-20">
      <Card>
        <CardHeader>
          <CardTitle>Suggested talking points</CardTitle>
          <p className="text-xs text-muted-foreground">From fixed rules on their data. Tick the ones you want to raise.</p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {prep.talkingPoints.length === 0 && <p className="text-sm text-muted-foreground">Nothing stands out — ask how they’re feeling about the goal.</p>}
          {prep.talkingPoints.map((tp) => (
            <label key={tp.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 text-sm hover:bg-muted">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={inAgenda(tp.id)} onChange={() => toggle(tp)} />
              <span className="grid gap-1">
                <Badge tone={KIND[tp.kind].tone} className="justify-self-start">
                  {KIND[tp.kind].label}
                </Badge>
                <span>{tp.text}</span>
                <span className="text-xs text-muted-foreground">{tp.because}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ol className="grid gap-1.5 text-sm">
            {agenda.map((a, i) => (
              <li key={a.id} className="flex items-start gap-2">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{a.text}</span>
                <button type="button" aria-label={`Remove “${a.text}”`} className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => setAgenda((x) => x.filter((y) => y.id !== a.id))}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
            {agenda.length === 0 && <li className="text-muted-foreground">Tick points above or add your own.</li>}
          </ol>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!custom.trim()) return;
              setAgenda((a) => [...a, { id: `custom-${Date.now()}`, text: custom.trim(), done: false }]);
              setCustom('');
            }}
          >
            <Input aria-label="Add your own point" placeholder="Add your own point" maxLength={300} value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Button type="submit" variant="outline" size="icon" aria-label="Add point">
              <Plus />
            </Button>
          </form>
          {prep.session ? (
            <div className="grid gap-2">
              <Button
                disabled={!dirty}
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: prep.session!.id, agenda },
                    { onSuccess: () => toast({ tone: 'success', message: 'Agenda saved' }), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
                  )
                }
              >
                <Save /> Save agenda
              </Button>
              <Button asChild variant="outline">
                <Link href={`/mentor/notes/edit?sessionId=${prep.session.id}`}>
                  <NotebookPen /> Open session notes
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Book a call with {firstName(prep.client.name)} to save this agenda with it.</p>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

function Facts({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="grid gap-2">
      <SectionTitle>{title}</SectionTitle>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {items.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MiniSeries({ title, points }: { title: string; points: { date: string; value: number }[] }) {
  if (points.length === 0) return null;
  return (
    <section className="grid gap-2">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex h-16 items-end gap-1" role="img" aria-label={`${title}: ${points.map((p) => `${formatDate(p.date)} ${p.value} of 5`).join(', ')}`}>
        {points.map((p) => (
          <span
            key={p.date}
            title={`${formatDate(p.date)}: ${p.value}/5`}
            className={cn('w-4 rounded-sm', p.value <= 2 ? 'bg-band-red' : p.value === 3 ? 'bg-band-amber' : 'bg-band-green')}
            style={{ height: `${(p.value / 5) * 100}%` }}
          />
        ))}
      </div>
    </section>
  );
}
