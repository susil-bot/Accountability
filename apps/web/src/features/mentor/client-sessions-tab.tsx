'use client';
import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { useSessions } from './api';
import { BookSessionDialog } from './book-session-dialog';
import { SessionRow } from './session-row';

export function SessionsTab({ clientId, clientName, canBook }: { clientId: string; clientName: string; canBook: boolean }) {
  const range = useMemo(() => ({ from: new Date(Date.now() - 120 * 86_400_000).toISOString(), to: new Date(Date.now() + 120 * 86_400_000).toISOString(), clientId }), [clientId]);
  const q = useSessions(range);
  const [book, setBook] = useState(false);
  if (q.isPending) return <Skeleton className="h-48" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const now = Date.now();
  const upcoming = q.data.filter((s) => new Date(s.startsAt).getTime() >= now - 3_600_000 && s.status === 'SCHEDULED');
  const past = q.data.filter((s) => !upcoming.includes(s)).reverse();
  return (
    <div className="grid gap-4">
      {canBook && (
        <Button className="justify-self-start" onClick={() => setBook(true)}>
          <CalendarPlus /> Book a call
        </Button>
      )}
      <h3 className="text-sm font-semibold">Upcoming</h3>
      <ul className="grid gap-2">
        {upcoming.map((s) => (
          <SessionRow key={s.id} s={s} showClient={false} canEdit={canBook} />
        ))}
        {upcoming.length === 0 && <li className="text-sm text-muted-foreground">No calls booked.</li>}
      </ul>
      <h3 className="text-sm font-semibold">Earlier</h3>
      <ul className="grid gap-2">
        {past.map((s) => (
          <SessionRow key={s.id} s={s} showClient={false} canEdit={canBook} />
        ))}
        {past.length === 0 && <li className="text-sm text-muted-foreground">No earlier sessions.</li>}
      </ul>
      {book && <BookSessionDialog open={book} onOpenChange={setBook} clients={[{ id: clientId, name: clientName }]} clientId={clientId} />}
    </div>
  );
}
