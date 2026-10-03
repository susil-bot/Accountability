'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { History, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton';
import { ErrorState, InlineAlert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, relativeTime, type AdminClient } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/features/mentor';
import { useAdminClients, useAdminMentors, useAssign, useAssignmentHistory, useEndAssignment, useSetActive } from './api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'pending', label: 'Waiting to accept' },
  { key: 'attention', label: 'Needs attention' },
] as const;

/** Functions 8–9: every client with status and mentor; assign, reassign, unassign; history. */
export function ClientsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter = FILTERS.find((f) => f.key === params.get('filter'))?.key ?? 'all';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useAdminClients(filter, debounced);
  const [assign, setAssign] = useState<AdminClient | null>(null);
  const [history, setHistory] = useState<AdminClient | null>(null);

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => router.replace(f.key === 'all' ? pathname : `${pathname}?filter=${f.key}`, { scroll: false })}
            className={cn('h-9 rounded-full border px-3 text-sm font-medium', filter === f.key ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
          >
            {f.label}
          </button>
        ))}
        <Input className="ml-auto max-w-xs" type="search" placeholder="Search name or email" aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.isPending ? (
        <PageSkeleton label="Loading clients" blocks={['h-20', 'h-20', 'h-20']} />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">No clients here.</p>
      ) : (
        <ul className="grid gap-2">
          {list.data.map((c) => (
            <li key={c.id}>
              <Card className={cn('grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center', !c.isActive && 'opacity-60')}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.isActive && c.assignment?.status === 'ACTIVE' ? (
                      <Link href={`/mentor/clients/detail?id=${c.id}`} className="font-semibold underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{c.name}</span>
                    )}
                    {c.isActive ? <StatusBadge status={c.status} /> : <Badge>Deactivated</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.email} · active {relativeTime(c.lastActiveAt)}
                  </p>
                </div>
                <div className="text-sm">
                  {c.assignment ? (
                    <>
                      <span className="font-medium">{c.assignment.mentor.name}</span>{' '}
                      <Badge tone={c.assignment.status === 'ACTIVE' ? 'success' : 'warning'}>{c.assignment.status === 'ACTIVE' ? 'Active' : 'Waiting to accept'}</Badge>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No mentor</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.isActive && (
                    <Button size="sm" variant={c.assignment ? 'outline' : 'default'} onClick={() => setAssign(c)}>
                      <UserPlus /> {c.assignment ? 'Reassign' : 'Assign'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setHistory(c)}>
                    <History /> History
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {assign && <AssignDialog client={assign} onClose={() => setAssign(null)} />}
      {history && <HistoryDialog client={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function AssignDialog({ client, onClose }: { client: AdminClient; onClose: () => void }) {
  const mentors = useAdminMentors();
  const assign = useAssign();
  const end = useEndAssignment();
  const toast = useToast();
  const [mentorId, setMentorId] = useState('');
  const [note, setNote] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const atCapacity = assign.error instanceof ApiError && assign.error.code === 'MENTOR_AT_CAPACITY';
  const options = (mentors.data ?? []).filter((m) => m.isActive && m.id !== client.assignment?.mentor.id);

  const submit = (overrideCapacity = false) =>
    assign.mutate(
      { clientId: client.id, mentorId, note: note.trim() || undefined, overrideCapacity },
      {
        onSuccess: () => {
          toast({ tone: 'success', message: `${client.name} has been asked to accept ${options.find((m) => m.id === mentorId)?.name}` });
          onClose();
        },
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={client.assignment ? `Reassign ${client.name}` : `Assign a mentor to ${client.name}`}
        description={
          client.assignment
            ? `${client.assignment.mentor.name} loses access immediately. ${client.name.split(' ')[0]} must accept the new mentor before anything is shared.`
            : `${client.name.split(' ')[0]} must accept before the mentor can see anything.`
        }
      >
        <div className="grid gap-4">
          {assign.isError && !atCapacity && <InlineAlert>{errorMessage(assign.error)}</InlineAlert>}
          {atCapacity && (
            <InlineAlert tone="warning">
              {errorMessage(assign.error)}{' '}
              <button type="button" className="font-semibold underline" onClick={() => submit(true)}>
                Assign anyway
              </button>
            </InlineAlert>
          )}
          {mentors.isPending ? (
            <Skeleton className="h-11" />
          ) : (
            <Field id="as-mentor" label="Mentor">
              <Select id="as-mentor" value={mentorId} onChange={(e) => (setMentorId(e.target.value), assign.reset())}>
                <option value="">Choose a mentor</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.activeClients + m.pendingClients}/{m.capacity} clients
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field id="as-note" label="Note (optional)" hint="Why this mentor — kept in the assignment history.">
            <Textarea id="as-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button size="lg" disabled={!mentorId} loading={assign.isPending} onClick={() => submit(false)}>
            {client.assignment ? 'Reassign' : 'Assign'}
          </Button>
          {client.assignment && (
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmEnd(true)}>
              Remove mentor without a replacement
            </Button>
          )}
        </div>
        <ConfirmDialog
          open={confirmEnd}
          onOpenChange={setConfirmEnd}
          title={`Unassign ${client.assignment?.mentor.name}?`}
          description="Their access ends immediately and future calls are cancelled."
          confirmLabel="Unassign"
          tone="danger"
          loading={end.isPending}
          onConfirm={() =>
            end.mutate(client.assignment!.id, {
              onSuccess: () => (toast({ tone: 'success', message: 'Mentor removed' }), onClose()),
              onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}

const REASON: Record<string, string> = { DECLINED: 'declined by client', REASSIGNED: 'reassigned', UNASSIGNED: 'unassigned by admin', CLIENT_STOPPED: 'client stopped sharing', ACCOUNT_DEACTIVATED: 'account deactivated' };

function HistoryDialog({ client, onClose }: { client: AdminClient; onClose: () => void }) {
  const q = useAssignmentHistory(client.id);
  const setActive = useSetActive();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={client.name} description="Who mentored this client, when, and why it ended.">
        {!q.data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-4">
            <ol className="grid gap-2">
              {q.data.assignments.map((a) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {a.mentor.name}{' '}
                    <Badge tone={a.status === 'ACTIVE' ? 'success' : a.status === 'PENDING' ? 'warning' : 'neutral'}>{a.status.toLowerCase()}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assigned by {a.assignedBy} · {formatDateTime(a.createdAt)}
                    {a.acceptedAt && ` · accepted ${formatDateTime(a.acceptedAt)}`}
                  </p>
                  {a.endedAt && (
                    <p className="text-xs text-muted-foreground">
                      Ended {formatDateTime(a.endedAt)} by {a.endedBy} ({REASON[a.endReason ?? ''] ?? a.endReason})
                    </p>
                  )}
                  {a.note && <p className="mt-1 text-xs">“{a.note}”</p>}
                </li>
              ))}
              {q.data.assignments.length === 0 && <li className="text-sm text-muted-foreground">Never assigned.</li>}
            </ol>
            <Button variant="outline" className={client.isActive ? 'text-danger' : ''} onClick={() => setConfirm(true)}>
              {client.isActive ? 'Deactivate account' : 'Reactivate account'}
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={client.isActive ? `Deactivate ${client.name}?` : `Reactivate ${client.name}?`}
          description={client.isActive ? 'They are signed out everywhere and their mentor loses access.' : 'They can sign in again. Assign a mentor afterwards if needed.'}
          confirmLabel={client.isActive ? 'Deactivate' : 'Reactivate'}
          tone={client.isActive ? 'danger' : 'default'}
          loading={setActive.isPending}
          onConfirm={() =>
            setActive.mutate(
              { id: client.id, active: !client.isActive },
              { onSuccess: () => (toast({ tone: 'success', message: 'Account updated' }), onClose()), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
