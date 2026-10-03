'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, History, PenLine, Pin, PinOff, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDateTime, NOTE_TAGS, SECTION_FIELDS, type Note } from '@/lib/mentoring';
import { useArchiveNote, useCreateNote, useNoteHistory, useNotes, usePinNote } from './api';

/** Functions 21–24: notes with search, tags, pins, archive and full edit history. */
export function NotesTab({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const notes = useNotes(clientId, { q: debounced || undefined, tag: tag || undefined, archived });

  return (
    <div className="grid gap-4">
      {canWrite && !archived && <QuickNote clientId={clientId} />}
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" type="search" placeholder="Search notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-40" aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {NOTE_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <ToggleChip pressed={archived} onPressedChange={setArchived}>
          Archived
        </ToggleChip>
      </div>
      {notes.isPending ? (
        <Skeleton className="h-64" />
      ) : notes.isError ? (
        <ErrorState message={errorMessage(notes.error)} onRetry={() => notes.refetch()} />
      ) : notes.data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{debounced || tag ? 'No notes match.' : archived ? 'No archived notes.' : 'No notes yet.'}</p>
      ) : (
        <ul className="grid gap-3">
          {notes.data.map((n) => (
            <NoteCard key={n.id} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickNote({ clientId }: { clientId: string }) {
  const create = useCreateNote(clientId);
  const toast = useToast();
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  return (
    <Card className="grid gap-3 p-4">
      <label htmlFor="quick-note" className="text-sm font-medium">
        Quick note
      </label>
      <Textarea id="quick-note" rows={2} maxLength={4000} placeholder="Something you noticed — only mentors and admins see this." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        {NOTE_TAGS.map((t) => (
          <ToggleChip key={t} className="h-8 text-xs" pressed={tags.includes(t)} onPressedChange={(on) => setTags((x) => (on ? [...x, t] : x.filter((y) => y !== t)))}>
            {t}
          </ToggleChip>
        ))}
        <Button
          className="ml-auto"
          size="sm"
          disabled={!text.trim()}
          loading={create.isPending}
          onClick={() =>
            create.mutate(
              { kind: 'QUICK', text: text.trim(), tags },
              { onSuccess: () => (setText(''), setTags([])), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
            )
          }
        >
          Save note
        </Button>
      </div>
    </Card>
  );
}

function NoteCard({ n }: { n: Note }) {
  const pin = usePinNote();
  const archive = useArchiveNote();
  const [history, setHistory] = useState(false);
  return (
    <li>
      <Card className="grid gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {n.pinned && <Pin className="size-3.5 text-primary" aria-label="Pinned" />}
          <Badge tone={n.kind === 'SESSION' ? 'primary' : 'neutral'}>{n.kind === 'SESSION' ? 'Session note' : 'Quick note'}</Badge>
          {n.isDraft && <Badge tone="warning">Draft</Badge>}
          <span>
            {n.author.name} · {formatDateTime(n.createdAt)}
            {n.version > 1 ? ` · edited (v${n.version})` : ''}
          </span>
          {n.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        {n.kind === 'SESSION' ? (
          <dl className="grid gap-1.5 text-sm">
            {SECTION_FIELDS.filter((f) => n.sections[f.key]).map((f) => (
              <div key={f.key}>
                <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
                <dd className="whitespace-pre-line">{n.sections[f.key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="whitespace-pre-line text-sm">{n.text}</p>
        )}
        {n.sharedSummary && (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
            <span className="flex items-center gap-1 text-xs font-medium text-secondary-foreground">
              <Share2 className="size-3" aria-hidden /> Shared with client
            </span>
            {n.sharedSummary}
          </p>
        )}
        {n.actions.length > 0 && (
          <ul className="text-sm text-muted-foreground">
            {n.actions.map((a) => (
              <li key={a.id}>
                {a.status === 'DONE' ? '✓' : '•'} {a.title} ({a.owner === 'CLIENT' ? 'client' : 'you'})
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          {n.canEdit && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/mentor/notes/edit?noteId=${n.id}`}>
                <PenLine /> Edit
              </Link>
            </Button>
          )}
          {n.canEdit && (
            <Button variant="ghost" size="sm" onClick={() => pin.mutate({ id: n.id, pinned: !n.pinned })}>
              {n.pinned ? <PinOff /> : <Pin />} {n.pinned ? 'Unpin' : 'Pin'}
            </Button>
          )}
          {n.version > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setHistory(true)}>
              <History /> History
            </Button>
          )}
          {n.canEdit && (
            <Button variant="ghost" size="sm" onClick={() => archive.mutate({ id: n.id, archived: !n.archived })}>
              {n.archived ? <ArchiveRestore /> : <Archive />} {n.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
        </div>
      </Card>
      {history && <HistoryDialog noteId={n.id} open={history} onOpenChange={setHistory} />}
    </li>
  );
}

function HistoryDialog({ noteId, open, onOpenChange }: { noteId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useNoteHistory(open ? noteId : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Earlier versions" description="Every edit keeps the version it replaced.">
        {!q.data ? (
          <Skeleton className="h-40" />
        ) : (
          <ol className="grid gap-3">
            {q.data.versions.map((v) => (
              <li key={v.version} className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Version {v.version} · replaced by {v.replacedBy} on {formatDateTime(v.replacedAt)}
                </p>
                <p className="mt-1 whitespace-pre-line">{v.text}</p>
                {v.sharedSummary && <p className="mt-1 text-xs text-muted-foreground">Shared: {v.sharedSummary}</p>}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
