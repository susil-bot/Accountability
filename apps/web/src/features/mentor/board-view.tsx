'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, Check, ClipboardList, MessageCircle, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { formatDateTime, relativeTime, STATUS_LABEL, type BoardClient, type ClientStatus } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useBoard, useMarkReviewed } from './api';
import { StatusBadge, TrendBars } from './bits';
import { NudgeDialog } from './nudge-dialog';
import { BookSessionDialog } from './book-session-dialog';

type Filter = 'ALL' | ClientStatus;
const CHECKIN_LABEL: Record<string, string> = { COMPLETED: 'Checked in', LATE: 'Checked in late', MISSED: 'Missed', PENDING: 'Not yet', NONE: '–' };

/** Function 1–2: one row per active client, most in need first, with a "reviewed today" tick. */
export function BoardView() {
  const q = useBoard();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [nudge, setNudge] = useState<BoardClient | null>(null);
  const [book, setBook] = useState<BoardClient | null>(null);
  const rows = useMemo(() => (q.data?.clients ?? []).filter((c) => filter === 'ALL' || c.status === filter), [q.data, filter]);

  if (q.isPending) return <PageSkeleton label="Loading your clients" blocks={['h-8 w-56', 'h-16', 'h-28', 'h-28', 'h-28']} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const b = q.data;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your clients</h1>
          <p className="text-sm text-muted-foreground">{formatDate(b.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        {b.total > 0 && (
          <div className="w-56">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">
                {b.reviewed} of {b.total} reviewed
              </span>
              <span className="text-muted-foreground">today</span>
            </div>
            <Progress value={(b.reviewed / Math.max(1, b.total)) * 100} label="Clients reviewed today" tone={b.reviewed === b.total ? 'success' : 'primary'} />
          </div>
        )}
      </header>

      {b.pending.length > 0 && (
        <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
          Waiting to accept: {b.pending.map((p) => `${p.name} (asked ${relativeTime(p.requestedAt)})`).join(', ')}. You’ll see their progress once they accept.
        </p>
      )}

      {b.total === 0 ? (
        <EmptyState icon={<Users />} title="No clients yet" description="Your admin assigns clients to you. Each client accepts before you can see their progress." />
      ) : (
        <>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            {(['ALL', 'NEEDS_ATTENTION', 'WATCH', 'ON_TRACK', 'INACTIVE'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn('h-9 rounded-full border px-3 text-sm font-medium', filter === f ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              >
                {f === 'ALL' ? `All ${b.total}` : `${STATUS_LABEL[f]} ${b.counts[f]}`}
              </button>
            ))}
          </div>

          <ul className="grid gap-3">
            {rows.map((c) => (
              <ClientRow key={c.id} c={c} onNudge={() => setNudge(c)} onBook={() => setBook(c)} />
            ))}
            {rows.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No clients in this group.</li>}
          </ul>
        </>
      )}

      {nudge && <NudgeDialog client={nudge} open={!!nudge} onOpenChange={(o) => !o && setNudge(null)} />}
      {book && <BookSessionDialog open={!!book} onOpenChange={(o) => !o && setBook(null)} clients={[book]} clientId={book.id} />}
    </div>
  );
}

function ClientRow({ c, onNudge, onBook }: { c: BoardClient; onNudge: () => void; onBook: () => void }) {
  const review = useMarkReviewed();
  return (
    <li>
      <Card className={cn('grid gap-3 p-4 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center', c.status === 'NEEDS_ATTENTION' && 'border-danger/40')}>
        <button
          type="button"
          aria-pressed={c.reviewedToday}
          aria-label={c.reviewedToday ? `${c.name} reviewed today. Undo` : `Mark ${c.name} as reviewed today`}
          onClick={() => review.mutate({ clientId: c.id, reviewed: !c.reviewedToday })}
          className={cn(
            'hidden size-9 place-items-center rounded-full border-2 md:grid',
            c.reviewedToday ? 'border-success bg-success text-white' : 'border-input text-transparent hover:border-primary hover:text-muted-foreground',
          )}
        >
          <Check className="size-4" aria-hidden />
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/mentor/clients/detail?id=${c.id}`} className="truncate text-base font-semibold underline-offset-4 hover:underline">
              {c.name}
            </Link>
            <StatusBadge status={c.status} />
            {c.noContactFlag && (
              <Badge tone="warning">
                <AlertTriangle className="size-3" aria-hidden /> No contact 7+ days
              </Badge>
            )}
          </div>
          {c.reasons.length > 0 && <p className="mt-1 text-sm text-danger">{c.reasons.join(' · ')}</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            Today {c.today.completed}/{c.today.planned} · Check-in: {CHECKIN_LABEL[c.checkIn]} · Streak {c.streak}
            {c.topBlocker ? ` · Top blocker: ${c.topBlocker.label} (${c.topBlocker.count})` : ''}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <TrendBars days={c.trend} />
          <div className="grid gap-0.5">
            <span>Active {relativeTime(c.lastActiveAt)}</span>
            <span>Contact {relativeTime(c.lastContactAt)}</span>
            {c.openActions > 0 && <span>{c.openActions} open action{c.openActions === 1 ? '' : 's'}</span>}
            {c.nextSessionAt && <span className="font-medium text-foreground">Call {formatDateTime(c.nextSessionAt)}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={c.reviewedToday ? 'secondary' : 'outline'}
            size="sm"
            className="md:hidden"
            aria-pressed={c.reviewedToday}
            onClick={() => review.mutate({ clientId: c.id, reviewed: !c.reviewedToday })}
          >
            <Check /> {c.reviewedToday ? 'Reviewed' : 'Mark reviewed'}
          </Button>
          <Button variant="outline" size="sm" onClick={onNudge}>
            <MessageCircle /> Nudge
          </Button>
          <Button variant="outline" size="sm" onClick={onBook}>
            <CalendarPlus /> Book
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/mentor/prep?clientId=${c.id}`}>
              <ClipboardList /> Prep
            </Link>
          </Button>
        </div>
      </Card>
    </li>
  );
}
