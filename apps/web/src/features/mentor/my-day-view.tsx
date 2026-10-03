'use client';
import Link from 'next/link';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { CHANNEL_LABEL, relativeTime } from '@/lib/mentoring';
import { useMarkNotificationRead } from '@/features/shell';
import { useMyDay, useUpdateAction } from './api';

/** Function 30: what needs doing today, in one place. */
export function MyDayView() {
  const q = useMyDay();
  const done = useUpdateAction();
  const read = useMarkNotificationRead();
  if (q.isPending) return <PageSkeleton label="Loading your day" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const empty = !d.alerts.length && !d.sessions.length && !d.followUps.length && !d.overdueClientActions.length && !d.notReviewed.length;

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My day</h1>
        <p className="text-sm text-muted-foreground">{formatDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      {empty && <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Nothing waiting for you today.</p>}

      {d.alerts.length > 0 && (
        <Card className="border-danger/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-danger" aria-hidden /> Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {d.alerts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-muted-foreground">
                    {a.body} · {relativeTime(a.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.clientId && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/mentor/clients/detail?id=${a.clientId}`}>Open</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => read.mutate(a.id, { onSettled: () => q.refetch() })}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Calls today</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {d.sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{new Date(s.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span> · {s.clientName} · {CHANNEL_LABEL[s.channel]}
                {s.status !== 'SCHEDULED' ? ` · ${s.status === 'DONE' ? 'done' : 'no-show'}` : ''}
              </span>
              <span className="flex gap-2">
                {s.status === 'SCHEDULED' && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/mentor/prep?sessionId=${s.id}`}>Prep</Link>
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href={`/mentor/notes/edit?sessionId=${s.id}`}>Notes</Link>
                </Button>
              </span>
            </div>
          ))}
          {d.sessions.length === 0 && <p className="text-sm text-muted-foreground">No calls today.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {d.followUps.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>
                {a.title} · <Link className="underline-offset-4 hover:underline" href={`/mentor/clients/detail?id=${a.clientId}&tab=actions`}>{a.clientName}</Link>
                {a.overdue && a.dueDate && <span className="ml-1 font-medium text-danger">overdue since {formatDate(a.dueDate)}</span>}
              </span>
              <Button size="sm" variant="outline" loading={done.isPending && done.variables?.id === a.id} onClick={() => done.mutate({ id: a.id, status: 'DONE' })}>
                <Check /> Done
              </Button>
            </div>
          ))}
          {d.followUps.length === 0 && <p className="text-sm text-muted-foreground">No follow-ups due.</p>}
        </CardContent>
      </Card>

      {d.overdueClientActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Overdue client actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {d.overdueClientActions.map((a) => (
              <p key={a.id}>
                <Link className="font-medium underline-offset-4 hover:underline" href={`/mentor/clients/detail?id=${a.clientId}&tab=actions`}>
                  {a.clientName}
                </Link>
                : {a.title} {a.dueDate && <span className="text-muted-foreground">(due {formatDate(a.dueDate)})</span>}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Not reviewed yet today</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {d.notReviewed.map((c) => (
            <Button key={c.id} asChild size="sm" variant="outline">
              <Link href={`/mentor/clients/detail?id=${c.id}`}>{c.name}</Link>
            </Button>
          ))}
          {d.notReviewed.length === 0 && <p className="text-sm text-muted-foreground">Everyone has been reviewed today.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
