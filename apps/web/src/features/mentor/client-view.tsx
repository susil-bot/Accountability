'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, ClipboardList, MessageCircle, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useSession as useMe } from '@/features/auth';
import { useClientOverview, useMarkReviewed } from './api';
import { StatusBadge, waUrl } from './bits';
import { NudgeDialog } from './nudge-dialog';
import { BookSessionDialog } from './book-session-dialog';
import { OverviewTab } from './client-overview-tab';
import { TimelineTab } from './client-timeline-tab';
import { NotesTab } from './client-notes-tab';
import { SessionsTab } from './client-sessions-tab';
import { ActionsTab } from './client-actions-tab';
import { ReportsTab } from './client-reports-tab';
import { NudgesTab } from './client-nudges-tab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'actions', label: 'Actions' },
  { key: 'reports', label: 'Reports' },
  { key: 'nudges', label: 'Nudges' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** Function 3: everything about one client, read-only, plus the mentor's own tools. */
export function ClientView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = params.get('id');
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'overview') as Tab;
  const q = useClientOverview(id);
  const me = useMe();
  const review = useMarkReviewed();
  const [nudge, setNudge] = useState(false);
  const [book, setBook] = useState(false);

  if (!id) return <ErrorState message="No client selected." />;
  if (q.isPending) return <PageSkeleton label="Loading client" blocks={['h-10 w-72', 'h-10', 'h-40', 'h-64']} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const isMentor = me.data?.role === 'MENTOR';
  const isAssigned = isMentor && d.client.mentor?.id === me.data?.id;
  const setTab = (t: Tab) => router.replace(`${pathname}?id=${id}${t === 'overview' ? '' : `&tab=${t}`}`, { scroll: false });

  return (
    <div className="grid gap-5">
      <Link href={isMentor ? '/mentor' : '/admin/clients'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {isMentor ? 'All clients' : 'Clients'}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{d.client.name}</h1>
            <StatusBadge status={d.status} />
          </div>
          {d.reasons.length > 0 && <p className="mt-1 text-sm text-danger">{d.reasons.join(' · ')}</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            Active {relativeTime(d.client.lastActiveAt)} · {d.client.timezone.replace(/_/g, ' ')}
            {!isAssigned && d.client.mentor ? ` · Mentor: ${d.client.mentor.name}` : ''}
          </p>
        </div>
        {isAssigned && (
          <div className="flex flex-wrap gap-2">
            <Button variant={d.reviewedToday ? 'secondary' : 'outline'} aria-pressed={d.reviewedToday} loading={review.isPending} onClick={() => review.mutate({ clientId: d.client.id, reviewed: !d.reviewedToday })}>
              <Check /> {d.reviewedToday ? 'Reviewed today' : 'Mark reviewed'}
            </Button>
            <Button variant="outline" onClick={() => setNudge(true)}>
              <MessageCircle /> Nudge
            </Button>
            {d.client.whatsapp.available && d.client.whatsapp.phone && (
              <Button asChild variant="outline">
                <a href={waUrl(d.client.whatsapp.phone)} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setBook(true)}>
              <CalendarPlus /> Book call
            </Button>
            <Button asChild variant="outline">
              <Link href={`/mentor/prep?clientId=${d.client.id}`}>
                <ClipboardList /> Prep
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/mentor/notes/edit?clientId=${d.client.id}`}>
                <PenLine /> Note
              </Link>
            </Button>
          </div>
        )}
      </header>

      <nav aria-label="Client sections" className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" className="flex min-w-max gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn('-mb-px h-10 border-b-2 px-3 text-sm font-medium', tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab d={d} />}
        {tab === 'timeline' && <TimelineTab clientId={d.client.id} />}
        {tab === 'notes' && <NotesTab clientId={d.client.id} canWrite={isMentor || me.data?.role === 'ADMIN'} />}
        {tab === 'sessions' && <SessionsTab clientId={d.client.id} clientName={d.client.name} canBook={isAssigned} />}
        {tab === 'actions' && <ActionsTab clientId={d.client.id} canEdit={isAssigned} />}
        {tab === 'reports' && <ReportsTab clientId={d.client.id} canEdit={isAssigned} />}
        {tab === 'nudges' && <NudgesTab client={{ id: d.client.id, name: d.client.name, streak: d.streak.current }} canEdit={isAssigned} />}
      </div>

      {nudge && <NudgeDialog client={{ id: d.client.id, name: d.client.name, streak: d.streak.current }} open={nudge} onOpenChange={setNudge} />}
      {book && <BookSessionDialog open={book} onOpenChange={setBook} clients={[{ id: d.client.id, name: d.client.name }]} clientId={d.client.id} />}
    </div>
  );
}
