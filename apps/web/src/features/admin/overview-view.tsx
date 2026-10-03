'use client';
import Link from 'next/link';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { STATUS_LABEL, type ClientStatus } from '@/lib/mentoring';
import { Stat } from '@/features/mentor';
import { useAdminOverview } from './api';

/** Function 6: the whole programme at a glance. */
export function OverviewView() {
  const q = useAdminOverview();
  if (q.isPending) return <PageSkeleton label="Loading overview" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const o = q.data;
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">{formatDate(o.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Linked href="/admin/clients">
          <Stat label="Clients" value={o.clients} hint={`${o.mentored} with an active mentor`} />
        </Linked>
        <Linked href="/admin/mentors">
          <Stat label="Mentors" value={o.mentors} hint={o.pendingInvites ? `${o.pendingInvites} invite${o.pendingInvites === 1 ? '' : 's'} pending` : 'no pending invites'} />
        </Linked>
        <Linked href="/admin/clients?filter=unassigned">
          <Stat label="Unassigned" value={o.unassigned} hint={`${o.pendingAssignments} waiting to accept`} tone={o.unassigned ? 'bad' : undefined} />
        </Linked>
        <Linked href="/admin/clients?filter=attention">
          <Stat label="Need attention" value={o.needsAttention} tone={o.needsAttention ? 'bad' : 'good'} />
        </Linked>
        <Stat label="Check-ins today" value={o.checkInsToday} />
        <Stat label="Missed yesterday" value={o.missedCheckInsYesterday} tone={o.missedCheckInsYesterday ? 'bad' : undefined} />
      </div>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Clients by status</h2>
        <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={(Object.keys(o.statusCounts) as ClientStatus[]).map((s) => `${STATUS_LABEL[s]} ${o.statusCounts[s]}`).join(', ')}>
          {(['NEEDS_ATTENTION', 'WATCH', 'ON_TRACK', 'INACTIVE'] as ClientStatus[]).map((s) => (
            <span key={s} className={{ NEEDS_ATTENTION: 'bg-band-red', WATCH: 'bg-band-amber', ON_TRACK: 'bg-band-green', INACTIVE: 'bg-band-none' }[s]} style={{ width: `${(o.statusCounts[s] / Math.max(1, o.clients)) * 100}%` }} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{(['NEEDS_ATTENTION', 'WATCH', 'ON_TRACK', 'INACTIVE'] as ClientStatus[]).map((s) => `${STATUS_LABEL[s]}: ${o.statusCounts[s]}`).join(' · ')}</p>
      </section>
    </div>
  );
}

function Linked({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring [&>div]:h-full [&>div]:transition-colors [&>div]:hover:border-primary">
      {children}
    </Link>
  );
}
