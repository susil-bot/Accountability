'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, toneForPercentage } from '@/components/ui/progress';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/mentoring';
import { Stat } from '@/features/mentor';
import { useMentorActivity } from './api';

function minutes(m: number | null) {
  if (m === null) return '–';
  return m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}

/** Function 31: how a mentor is doing over the last 30 days. */
export function MentorDetailView() {
  const id = useSearchParams().get('id');
  const q = useMentorActivity(id);
  if (!id) return <ErrorState message="No mentor selected." />;
  if (q.isPending) return <PageSkeleton label="Loading mentor activity" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data;
  return (
    <div className="grid gap-5">
      <Link href="/admin/mentors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Mentors
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{a.mentor.name}</h1>
        <p className="text-sm text-muted-foreground">
          {a.mentor.email} · last active {relativeTime(a.mentor.lastActiveAt)} · last {a.windowDays} days
        </p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active clients" value={`${a.activeClients}/${a.mentor.capacity}`} />
        <Stat label="Sessions held" value={a.sessionsHeld} hint={`${a.sessionsNoShow} no-show · ${a.sessionsCancelled} cancelled`} />
        <Stat label="Notes written" value={a.notesWritten} />
        <Stat label="Nudges" value={a.nudgesSent} hint={`${a.automaticNudges} automatic`} />
        <Stat label="Nudge response" value={a.nudgeResponseRate === null ? '–' : `${a.nudgeResponseRate}%`} hint={`check-in within ${a.nudgeResponseWindowHours} h`} />
        <Stat label="Acts on alerts in" value={minutes(a.medianResponseMinutes)} hint={`${a.alertsActedOn} of ${a.alerts} alerts acted on`} />
        <Stat label="Overdue follow-ups" value={a.overdueFollowUps} tone={a.overdueFollowUps ? 'bad' : 'good'} />
        <Stat label="Clients’ consistency" value={a.clientsAverageConsistency === null ? '–' : `${a.clientsAverageConsistency}%`} hint="average, 30 days" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {a.clients.map((c) => (
            <div key={c.id} className="grid gap-1">
              <div className="flex justify-between text-sm">
                <Link href={`/mentor/clients/detail?id=${c.id}`} className="font-medium underline-offset-4 hover:underline">
                  {c.name}
                </Link>
                <span className="text-muted-foreground">{c.consistency === null ? 'no data' : `${c.consistency}%`}</span>
              </div>
              <Progress value={c.consistency ?? 0} label={`${c.name} consistency`} tone={toneForPercentage(c.consistency ?? 0)} />
            </div>
          ))}
          {a.clients.length === 0 && <p className="text-sm text-muted-foreground">No active clients.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
