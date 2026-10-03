'use client';
import { CalendarClock, ExternalLink, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { CHANNEL_LABEL, formatDateTime, relativeTime, type MyMentor } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useMentorUpdates, useMyActions, useMySessions, useTickAction } from './api';

/**
 * "From your mentor" on Today: upcoming calls, the client's action items (tick to finish),
 * and what the mentor chose to share. Private mentor notes never reach this screen.
 */
export function FromMentorSection({ mentor }: { mentor: MyMentor }) {
  const active = mentor.assignment?.status === 'ACTIVE';
  const updates = useMentorUpdates(active);
  const sessions = useMySessions(active);
  const actions = useMyActions(active);
  const tick = useTickAction();
  if (!active) return null;

  const u = updates.data;
  const open = (actions.data ?? []).filter((a) => a.status === 'OPEN');
  const done = (actions.data ?? []).filter((a) => a.status === 'DONE');
  const latestShared = [...(u?.summaries ?? []).map((s) => ({ kind: 'summary' as const, at: s.sharedAt, ...s }))].slice(0, 2);
  const report = u?.reports[0];
  const nothing = !sessions.data?.length && !actions.data?.length && !u?.messages.length && !latestShared.length && !report;

  return (
    <section id="from-mentor" aria-labelledby="from-mentor-h" className="grid scroll-mt-20 gap-3">
      <h2 id="from-mentor-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        From your mentor · {mentor.assignment!.mentor.name}
      </h2>

      {sessions.data && sessions.data.length > 0 && (
        <Card id="sessions" className="scroll-mt-20">
          <CardContent className="grid gap-2 pt-5">
            {sessions.data.slice(0, 2).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" aria-hidden />
                  <span className="font-medium">{formatDateTime(s.startsAt)}</span>
                  <span className="text-muted-foreground">
                    · {CHANNEL_LABEL[s.channel]} · {s.durationMin} min
                  </span>
                </span>
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Join <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(open.length > 0 || done.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Your action items</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1">
              {[...open, ...done].map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 accent-[var(--primary)]"
                      checked={a.status === 'DONE'}
                      onChange={(e) => tick.mutate({ id: a.id, done: e.target.checked })}
                    />
                    <span className="grid gap-0.5 text-sm">
                      <span className={cn(a.status === 'DONE' && 'text-muted-foreground line-through')}>{a.title}</span>
                      {a.dueDate && (
                        <span className={cn('text-xs', a.overdue ? 'font-medium text-danger' : 'text-muted-foreground')}>
                          {a.overdue ? 'Overdue · ' : 'Due '}
                          {formatDate(a.dueDate)}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {u && u.messages.length > 0 && (
        <Card>
          <CardContent className="grid gap-3 pt-5">
            {u.messages.slice(0, 3).map((m) => (
              <div key={m.id} className="flex gap-3 text-sm">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <p>{m.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.from} · {relativeTime(m.sentAt)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {latestShared.map((s) => (
        <Card key={s.id}>
          <CardContent className="grid gap-1 pt-5 text-sm">
            <Badge tone="primary" className="justify-self-start">
              Summary
            </Badge>
            <p className="whitespace-pre-line">{s.text}</p>
            <p className="text-xs text-muted-foreground">
              {s.from} · {relativeTime(s.at)}
            </p>
          </CardContent>
        </Card>
      ))}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Week of {formatDate(report.weekStart, { month: 'short', day: 'numeric' })}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-muted-foreground">
              Consistency {report.metrics.consistency ?? '–'}% · {report.metrics.tasksCompleted}/{report.metrics.tasksPlanned} tasks · {report.metrics.checkIns}/{report.metrics.checkInDays}{' '}
              check-ins
            </p>
            {report.mentorComment && <p className="whitespace-pre-line">“{report.mentorComment}”</p>}
          </CardContent>
        </Card>
      )}

      {nothing && <p className="rounded-xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">Messages, calls and action items from your mentor will show up here.</p>}
    </section>
  );
}
