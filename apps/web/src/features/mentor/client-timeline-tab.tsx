'use client';
import { CalendarClock, CheckCircle2, ClipboardCheck, FileImage, Flag, MessageCircle, NotebookPen, UserPlus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { formatDateTime, type TimelineEvent } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useTimeline } from './api';

const ICON: Record<string, typeof Flag> = {
  CHECKIN: ClipboardCheck,
  CHECKIN_MISSED: XCircle,
  TASK_MISSED: XCircle,
  EVIDENCE: FileImage,
  NUDGE: MessageCircle,
  SESSION: CalendarClock,
  NOTE: NotebookPen,
  ACTION: Flag,
  ACTION_DONE: CheckCircle2,
  ASSIGNMENT: UserPlus,
};

/** Function 26: everything that happened, newest first. */
export function TimelineTab({ clientId }: { clientId: string }) {
  const q = useTimeline(clientId);
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  return (
    <div className="grid gap-4">
      <ol className="relative grid gap-4 border-l pl-6">
        {items.map((e) => (
          <Item key={e.id} e={e} />
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
      </ol>
      {q.hasNextPage && (
        <Button variant="outline" className="justify-self-start" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          Show older
        </Button>
      )}
    </div>
  );
}

function Item({ e }: { e: TimelineEvent }) {
  const Icon = ICON[e.type] ?? Flag;
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[37px] grid size-6 place-items-center rounded-full border bg-card',
          e.tone === 'good' && 'border-success text-success',
          e.tone === 'bad' && 'border-danger text-danger',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{e.title}</p>
      {e.detail && <p className="whitespace-pre-line text-sm text-muted-foreground">{e.detail}</p>}
      <time dateTime={e.at} className="text-xs text-muted-foreground">
        {formatDateTime(e.at)}
      </time>
    </li>
  );
}
