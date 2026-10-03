'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Copy, MessageCircle, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState, InlineAlert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDateTime, relativeTime, type AdminMentor } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useAdminMentors, useInviteMentor, useInvites, useRevokeInvite, useSetActive, useSetCapacity } from './api';

/** Function 7: mentors with their load, plus invites. */
export function MentorsView() {
  const mentors = useAdminMentors();
  const invites = useInvites();
  const revoke = useRevokeInvite();
  const [invite, setInvite] = useState(false);
  const pending = (invites.data ?? []).filter((i) => i.status === 'PENDING');

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mentors</h1>
        <Button onClick={() => setInvite(true)}>
          <UserPlus /> Invite mentor
        </Button>
      </header>
      {mentors.isPending ? (
        <PageSkeleton label="Loading mentors" blocks={['h-20', 'h-20']} />
      ) : mentors.isError ? (
        <ErrorState message={errorMessage(mentors.error)} onRetry={() => mentors.refetch()} />
      ) : (
        <ul className="grid gap-2">
          {mentors.data.map((m) => (
            <MentorRow key={m.id} m={m} />
          ))}
          {mentors.data.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No mentors yet. Invite your first one.</li>}
        </ul>
      )}
      {pending.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending invites</h2>
          <ul className="grid gap-2">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <span>
                  {i.name} · {i.email} <span className="text-muted-foreground">· expires {formatDateTime(i.expiresAt)}</span>
                </span>
                <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invite && <InviteDialog onClose={() => setInvite(false)} />}
    </div>
  );
}

function MentorRow({ m }: { m: AdminMentor }) {
  const setCapacity = useSetCapacity();
  const setActive = useSetActive();
  const toast = useToast();
  const [cap, setCap] = useState(String(m.capacity));
  const [confirm, setConfirm] = useState(false);
  const load = m.activeClients + m.pendingClients;
  return (
    <li>
      <Card className={cn('grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center', !m.isActive && 'opacity-60')}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/mentors/detail?id=${m.id}`} className="font-semibold underline-offset-4 hover:underline">
              {m.name}
            </Link>
            {!m.isActive && <Badge>Deactivated</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {m.email} · active {relativeTime(m.lastActiveAt)}
          </p>
        </div>
        <div className="grid gap-1 text-sm">
          <span>
            {m.activeClients} active{m.pendingClients ? ` + ${m.pendingClients} waiting` : ''} of {m.capacity}
          </span>
          <Progress value={(load / Math.max(1, m.capacity)) * 100} label={`${m.name} load`} tone={load >= m.capacity ? 'warning' : 'primary'} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label={`Capacity for ${m.name}`} className="h-9 w-20" type="number" min={1} max={100} value={cap} onChange={(e) => setCap(e.target.value)} />
          <Button
            size="sm"
            variant="outline"
            disabled={Number(cap) === m.capacity || !(Number(cap) >= 1 && Number(cap) <= 100)}
            loading={setCapacity.isPending}
            onClick={() => setCapacity.mutate({ id: m.id, capacity: Number(cap) }, { onSuccess: () => toast({ tone: 'success', message: 'Capacity saved' }) })}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" className={m.isActive ? 'text-danger' : ''} onClick={() => setConfirm(true)}>
            {m.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={m.isActive ? `Deactivate ${m.name}?` : `Reactivate ${m.name}?`}
        description={m.isActive ? `They are signed out everywhere and their ${load} client${load === 1 ? '' : 's'} become unassigned.` : 'They can sign in again. Assign clients afterwards.'}
        confirmLabel={m.isActive ? 'Deactivate' : 'Reactivate'}
        tone={m.isActive ? 'danger' : 'default'}
        loading={setActive.isPending}
        onConfirm={() =>
          setActive.mutate(
            { id: m.id, active: !m.isActive },
            {
              onSuccess: (r) => toast({ tone: 'success', message: m.isActive ? `Deactivated · ${r.endedAssignments} client(s) unassigned` : 'Reactivated' }),
              onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
              onSettled: () => setConfirm(false),
            },
          )
        }
      />
    </li>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const invite = useInviteMentor();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const link = invite.data?.inviteUrl;
  const message = link ? `Hi ${name.split(' ')[0]}, you're invited to mentor on Accountability. Set your password here (valid 7 days, works once): ${link}` : '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Invite a mentor" description="You’ll get a one-time link to send them. It works once and expires after 7 days. They choose their own password.">
        {link ? (
          <div className="grid gap-3">
            <Field id="inv-link" label="Invite link">
              <Input id="inv-link" readOnly value={link} onFocus={(e) => e.target.select()} />
            </Field>
            <Button
              size="lg"
              onClick={() =>
                navigator.clipboard.writeText(link).then(
                  () => toast({ tone: 'success', message: 'Link copied' }),
                  () => toast({ tone: 'error', message: 'Couldn’t copy — select the link and copy it manually' }),
                )
              }
            >
              <Copy /> Copy link
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Send on WhatsApp
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">This link is shown only once. If it’s lost, send a new invite (the old one stops working).</p>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate({ name: name.trim(), email: email.trim() });
            }}
          >
            {invite.isError && <InlineAlert>{errorMessage(invite.error)}</InlineAlert>}
            <Field id="inv-name" label="Name">
              <Input id="inv-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="inv-email" label="Email">
              <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" loading={invite.isPending} disabled={!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())}>
              Create invite link
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
