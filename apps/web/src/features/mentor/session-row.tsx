'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, ClipboardList, ExternalLink, MoreHorizontal, NotebookPen, UserX, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { CHANNEL_LABEL, formatDateTime, SESSION_STATUS_LABEL, type MentorSession } from '@/lib/mentoring';
import { useUpdateSession } from './api';
import { BookSessionDialog } from './book-session-dialog';

const TONE = { SCHEDULED: 'primary', DONE: 'success', NO_SHOW: 'danger', CANCELLED: 'neutral' } as const;

/** One session with its next steps: prep before, notes after, and the outcome. */
export function SessionRow({ s, showClient = true, canEdit = true }: { s: MentorSession; showClient?: boolean; canEdit?: boolean }) {
  const update = useUpdateSession();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [menu, setMenu] = useState(false);
  const started = new Date(s.startsAt).getTime() <= Date.now();
  const set = (status: MentorSession['status']) =>
    update.mutate({ id: s.id, status }, { onError: (e) => toast({ tone: 'error', message: errorMessage(e) }), onSettled: () => (setCancel(false), setMenu(false)) });

  return (
    <li className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{formatDateTime(s.startsAt)}</span>
          <Badge tone={TONE[s.status]}>{SESSION_STATUS_LABEL[s.status]}</Badge>
          {s.hasNote && <Badge>Notes written</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {showClient && s.clientName ? (
            <>
              <Link href={`/mentor/clients/detail?id=${s.clientId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {s.clientName}
              </Link>
              {' · '}
            </>
          ) : null}
          {CHANNEL_LABEL[s.channel]} · {s.durationMin} min · reminder {s.reminderLeadMin} min before
          {s.agenda.length > 0 ? ` · ${s.agenda.length} agenda item${s.agenda.length === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {s.link && s.status === 'SCHEDULED' && (
            <Button asChild variant="outline" size="sm">
              <a href={s.link} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Join
              </a>
            </Button>
          )}
          {s.status === 'SCHEDULED' && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/mentor/prep?sessionId=${s.id}`}>
                <ClipboardList /> Prep
              </Link>
            </Button>
          )}
          {(started || s.status !== 'SCHEDULED') && s.status !== 'CANCELLED' && (
            <Button asChild size="sm">
              <Link href={`/mentor/notes/edit?sessionId=${s.id}`}>
                <NotebookPen /> {s.hasNote ? 'Open notes' : 'Write notes'}
              </Link>
            </Button>
          )}
          {s.status === 'SCHEDULED' && (
            <div className="relative">
              <Button variant="ghost" size="sm" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal />
              </Button>
              {menu && (
                <div className="absolute right-0 z-20 mt-1 grid w-44 gap-0.5 rounded-lg border bg-card p-1 shadow-lg">
                  {started && (
                    <>
                      <MenuItem icon={CheckCircle2} label="Mark done" onClick={() => set('DONE')} />
                      <MenuItem icon={UserX} label="Mark no-show" onClick={() => set('NO_SHOW')} />
                    </>
                  )}
                  {!started && <MenuItem icon={ClipboardList} label="Move or edit" onClick={() => (setEdit(true), setMenu(false))} />}
                  <MenuItem icon={X} label="Cancel session" onClick={() => (setCancel(true), setMenu(false))} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {edit && <BookSessionDialog open={edit} onOpenChange={setEdit} clients={[{ id: s.clientId, name: s.clientName ?? 'Client' }]} session={s} />}
      <ConfirmDialog
        open={cancel}
        onOpenChange={setCancel}
        title="Cancel this session?"
        description="The client is told, and no reminders will be sent."
        confirmLabel="Cancel session"
        tone="danger"
        loading={update.isPending}
        onConfirm={() => set('CANCELLED')}
      />
    </li>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof X; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted">
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}
