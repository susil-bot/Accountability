'use client';
import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import type { MentorSession } from '@/lib/mentoring';
import { useBoard, useSessions } from './api';
import { BookSessionDialog } from './book-session-dialog';
import { SessionRow } from './session-row';

function mondayOf(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Function 19: this week's and next weeks' calls, grouped by day. */
export function SessionsView() {
  const [offset, setOffset] = useState(0);
  const start = useMemo(() => {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + offset * 7);
    return m;
  }, [offset]);
  const end = useMemo(() => new Date(start.getTime() + 7 * 86_400_000), [start]);
  const q = useSessions({ from: start.toISOString(), to: end.toISOString() });
  const board = useBoard();
  const [book, setBook] = useState(false);
  const clients = (board.data?.clients ?? []).map((c) => ({ id: c.id, name: c.name }));

  const sessions = q.data;
  const days = useMemo(() => {
    const groups = new Map<string, MentorSession[]>();
    for (const s of sessions ?? []) {
      const key = new Date(s.startsAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()];
  }, [sessions]);

  const label = `${start.toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${new Date(end.getTime() - 1).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <Button onClick={() => setBook(true)} disabled={clients.length === 0}>
          <CalendarPlus /> Book a call
        </Button>
      </header>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium">{offset === 0 ? `This week · ${label}` : label}</span>
        <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight />
        </Button>
        {offset !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>
            Today
          </Button>
        )}
      </div>
      {q.isPending ? (
        <PageSkeleton label="Loading sessions" blocks={['h-24', 'h-24']} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : days.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">No sessions this week.</p>
      ) : (
        days.map(([day, list]) => (
          <section key={day} className="grid gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{new Date(day).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <ul className="grid gap-2">
              {list.map((s) => (
                <SessionRow key={s.id} s={s} />
              ))}
            </ul>
          </section>
        ))
      )}
      {book && <BookSessionDialog open={book} onOpenChange={setBook} clients={clients} />}
    </div>
  );
}
