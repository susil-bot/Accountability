'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { WeeklyReport } from '@/lib/mentoring';
import { useRefreshReport, useReports, useUpdateReport } from './api';

/** Function 29: weekly report per client, with a mentor comment that can be shared. */
export function ReportsTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const q = useReports(clientId);
  const refresh = useRefreshReport(clientId);
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">A report is created every Monday for the week before. Add a comment and share it with the client when you’re happy with it.</p>
      <Button variant="outline" className="justify-self-start" loading={refresh.isPending} onClick={() => refresh.mutate(today)}>
        <RefreshCw /> This week so far
      </Button>
      {q.data.length === 0 && <p className="text-sm text-muted-foreground">No reports yet.</p>}
      {q.data.map((r) => (
        <ReportCard key={r.id} r={r} canEdit={canEdit} />
      ))}
    </div>
  );
}

function ReportCard({ r, canEdit }: { r: WeeklyReport; canEdit: boolean }) {
  const update = useUpdateReport();
  const toast = useToast();
  const [comment, setComment] = useState(r.mentorComment ?? '');
  useEffect(() => setComment(r.mentorComment ?? ''), [r.mentorComment]);
  const m = r.metrics;
  const save = (share?: boolean) =>
    update.mutate(
      { id: r.id, mentorComment: comment.trim() || null, ...(share !== undefined ? { share } : {}) },
      { onSuccess: () => toast({ tone: 'success', message: share ? 'Shared with the client' : 'Saved' }), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
    );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          Week of {formatDate(m.weekStart, { month: 'short', day: 'numeric' })} – {formatDate(m.weekEnd, { month: 'short', day: 'numeric' })}
        </CardTitle>
        {r.sharedAt ? <Badge tone="success">Shared</Badge> : <Badge>Not shared</Badge>}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Consistency" value={m.consistency === null ? '–' : `${m.consistency}%`} />
          <Metric label="Tasks" value={`${m.tasksCompleted}/${m.tasksPlanned}`} />
          <Metric label="Check-ins" value={`${m.checkIns}/${m.checkInDays}`} />
          <Metric label="Sessions" value={String(m.sessionsHeld)} />
          <Metric label="Actions done" value={String(m.actionsDone)} />
          <Metric label="Open actions" value={String(m.actionsOpen)} />
          <Metric label="Streak" value={String(m.streak)} />
          <Metric label="Score" value={m.score === null ? '–' : String(m.score)} />
        </dl>
        {m.commitments.length > 0 && (
          <ul className="grid gap-1 text-muted-foreground">
            {m.commitments.map((c) => (
              <li key={c.title}>
                {c.title}: {c.completed}/{c.planned} ({c.completionRate}%)
              </li>
            ))}
          </ul>
        )}
        {m.topBlockers.length > 0 && <p className="text-muted-foreground">Top blockers: {m.topBlockers.map((b) => `${b.label} (${b.count})`).join(', ')}</p>}
        {canEdit ? (
          <>
            <Textarea aria-label="Your comment" rows={3} maxLength={1000} placeholder="A short comment for the client" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" loading={update.isPending} onClick={() => save()}>
                Save comment
              </Button>
              <Button size="sm" loading={update.isPending} onClick={() => save(!r.sharedAt)}>
                <Share2 /> {r.sharedAt ? 'Stop sharing' : 'Share with client'}
              </Button>
            </div>
          </>
        ) : (
          r.mentorComment && <p>“{r.mentorComment}”</p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
