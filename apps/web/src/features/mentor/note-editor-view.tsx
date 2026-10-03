'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState, InlineAlert } from '@/components/ui/states';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { CHANNEL_LABEL, formatDateTime, NOTE_TAGS, SECTION_FIELDS, type AgendaItem, type MentorSession, type Note, type Sections } from '@/lib/mentoring';
import { useCreateNote, useMentorSession, useNote, useSessionNote, useUpdateNote, useUpdateSession } from './api';

const AUTOSAVE_MS = 2500;

/**
 * Functions 21, 23–25: write or update notes. Session notes use the template and show the agenda;
 * unpublished drafts autosave; published notes keep every earlier version on save.
 */
export function NoteEditorView() {
  const params = useSearchParams();
  const noteId = params.get('noteId');
  const sessionId = params.get('sessionId');
  const session = useMentorSession(sessionId);
  const sessionNote = useSessionNote(sessionId);
  const existingId = noteId ?? sessionNote.data?.id ?? null;
  const note = useNote(existingId);

  const clientId = note.data?.clientId ?? session.data?.clientId ?? params.get('clientId');
  const loading = (sessionId && (session.isPending || sessionNote.isPending)) || (existingId && note.isPending);
  const error = session.error ?? sessionNote.error ?? note.error;

  if (!clientId && !loading && !error) return <ErrorState message="Open notes from a client or a session." />;
  if (loading) return <PageSkeleton label="Loading notes" blocks={['h-8 w-64', 'h-64', 'h-40']} />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (note.data && !note.data.canEdit) return <ErrorState message="Only the person who wrote this note can edit it." />;
  return <Editor key={note.data?.id ?? 'new'} clientId={clientId!} session={session.data ?? null} initial={note.data ?? null} />;
}

interface Draft {
  kind: 'SESSION' | 'QUICK';
  sections: Sections;
  text: string;
  tags: string[];
  sharedSummary: string;
}

function Editor({ clientId, session, initial }: { clientId: string; session: MentorSession | null; initial: Note | null }) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateNote(clientId);
  const update = useUpdateNote();
  const updateSession = useUpdateSession();
  const [noteState, setNoteState] = useState<Note | null>(initial);
  const [draft, setDraft] = useState<Draft>({
    kind: initial?.kind ?? 'SESSION',
    sections: initial?.sections ?? {},
    text: initial?.text ?? '',
    tags: initial?.tags ?? [],
    sharedSummary: initial?.sharedSummary ?? '',
  });
  const [actions, setActions] = useState<{ owner: 'CLIENT' | 'MENTOR'; title: string; dueDate: string }[]>([]);
  const [markDone, setMarkDone] = useState(!!session && session.status === 'SCHEDULED' && new Date(session.startsAt).getTime() <= Date.now());
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const touched = useRef(false);
  const creating = useRef(false);

  const isPublished = !!noteState && !noteState.isDraft;
  const body = useCallback(
    () => ({
      kind: draft.kind,
      sections: draft.kind === 'SESSION' ? draft.sections : undefined,
      text: draft.kind === 'QUICK' ? draft.text : undefined,
      tags: draft.tags,
      sharedSummary: draft.sharedSummary.trim() || null,
    }),
    [draft],
  );

  // Autosave unpublished drafts only (published notes are versioned on every save, so they save explicitly).
  useEffect(() => {
    if (!touched.current || isPublished) return;
    const t = setTimeout(async () => {
      setSaved('saving');
      try {
        if (!noteState) {
          if (creating.current) return;
          creating.current = true;
          const n = await create.mutateAsync({ ...body(), sessionId: session?.id, isDraft: true });
          setNoteState(n);
        } else {
          const n = await update.mutateAsync({ id: noteState.id, ...body(), isDraft: true, quiet: true });
          setNoteState(n);
        }
        setSaved('saved');
      } catch {
        setSaved('idle');
      } finally {
        creating.current = false;
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autosave reacts to content changes only
  }, [draft]);

  const change = (patch: Partial<Draft>) => {
    touched.current = true;
    setSaved('idle');
    setDraft((d) => ({ ...d, ...patch }));
  };

  const publish = async () => {
    const newActions = actions.filter((a) => a.title.trim()).map((a) => ({ owner: a.owner, title: a.title.trim(), dueDate: a.dueDate || null }));
    try {
      if (!noteState) await create.mutateAsync({ ...body(), sessionId: session?.id, isDraft: false, actions: newActions });
      else await update.mutateAsync({ id: noteState.id, ...body(), isDraft: false, actions: newActions, expectedVersion: noteState.version });
      if (session && markDone && session.status === 'SCHEDULED') await updateSession.mutateAsync({ id: session.id, status: 'DONE' });
      toast({ tone: 'success', message: draft.sharedSummary.trim() ? 'Saved — the summary was shared with the client' : 'Note saved' });
      router.push(`/mentor/clients/detail?id=${clientId}&tab=notes`);
    } catch (e) {
      toast({ tone: 'error', message: errorMessage(e) });
    }
  };

  const toggleAgenda = (item: AgendaItem) => {
    if (!session) return;
    updateSession.mutate({ id: session.id, agenda: session.agenda.map((a) => (a.id === item.id ? { ...a, done: !a.done } : a)) });
  };

  const empty = draft.kind === 'QUICK' ? !draft.text.trim() : !Object.values(draft.sections).some((v) => v?.trim());
  const err = create.error ?? update.error;

  return (
    <div className="grid gap-5">
      <Link href={`/mentor/clients/detail?id=${clientId}&tab=notes`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to notes
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{session ? 'Session notes' : initial ? 'Edit note' : 'New note'}</h1>
          {session && (
            <p className="text-sm text-muted-foreground">
              {session.clientName} · {formatDateTime(session.startsAt)} · {CHANNEL_LABEL[session.channel]}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {isPublished ? `Version ${noteState!.version} · earlier versions are kept` : saved === 'saving' ? 'Saving draft…' : saved === 'saved' ? 'Draft saved' : noteState ? 'Draft' : ''}
        </p>
      </header>

      {err && <InlineAlert>{errorMessage(err)}</InlineAlert>}

      {session && session.agenda.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Agenda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {session.agenda.map((a) => (
              <label key={a.id} className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={a.done} onChange={() => toggleAgenda(a)} />
                <span className={a.done ? 'text-muted-foreground line-through' : ''}>{a.text}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {!initial && !session && (
        <Segmented<'SESSION' | 'QUICK'>
          label="Kind of note"
          value={draft.kind}
          onChange={(kind) => change({ kind })}
          options={[
            { value: 'SESSION', label: 'Session template' },
            { value: 'QUICK', label: 'Quick note' },
          ]}
        />
      )}

      <Card>
        <CardContent className="grid gap-4 pt-5">
          {draft.kind === 'SESSION' ? (
            SECTION_FIELDS.map((f) => (
              <Field key={f.key} id={`sec-${f.key}`} label={f.label}>
                <Textarea id={`sec-${f.key}`} rows={f.key === 'howTheyAreDoing' || f.key === 'agreed' ? 3 : 2} maxLength={4000} placeholder={f.placeholder} value={draft.sections[f.key] ?? ''} onChange={(e) => change({ sections: { ...draft.sections, [f.key]: e.target.value } })} />
              </Field>
            ))
          ) : (
            <Field id="note-text" label="Note">
              <Textarea id="note-text" rows={5} maxLength={4000} value={draft.text} onChange={(e) => change({ text: e.target.value })} />
            </Field>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Tags</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_TAGS.map((t) => (
                <ToggleChip key={t} className="h-8 text-xs" pressed={draft.tags.includes(t)} onPressedChange={(on) => change({ tags: on ? [...draft.tags, t] : draft.tags.filter((x) => x !== t) })}>
                  {t}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action items</CardTitle>
          <p className="text-sm text-muted-foreground">Client items show in their app; yours become follow-up reminders.</p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {noteState?.actions.map((a) => (
            <p key={a.id} className="text-sm text-muted-foreground">
              {a.status === 'DONE' ? '✓' : '•'} {a.title} ({a.owner === 'CLIENT' ? 'client' : 'you'})
            </p>
          ))}
          {actions.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <Input aria-label="Action" placeholder="What needs to happen" maxLength={200} value={a.title} onChange={(e) => setActions((x) => x.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
              <Select aria-label="Owner" value={a.owner} onChange={(e) => setActions((x) => x.map((y, j) => (j === i ? { ...y, owner: e.target.value as 'CLIENT' | 'MENTOR' } : y)))}>
                <option value="CLIENT">Client</option>
                <option value="MENTOR">Me</option>
              </Select>
              <Input aria-label="Due date" type="date" value={a.dueDate} onChange={(e) => setActions((x) => x.map((y, j) => (j === i ? { ...y, dueDate: e.target.value } : y)))} />
              <Button variant="ghost" size="icon" aria-label="Remove action" onClick={() => setActions((x) => x.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setActions((x) => [...x, { owner: 'CLIENT', title: '', dueDate: '' }])}>
            <Plus /> Add action
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary for the client (optional)</CardTitle>
          <p className="text-sm text-muted-foreground">Your notes stay private. Only this summary is shown to the client, under “From your mentor”.</p>
        </CardHeader>
        <CardContent>
          <Textarea aria-label="Summary for the client" rows={3} maxLength={1000} placeholder="e.g. Great progress this week! We agreed to move interview prep to 18:00." value={draft.sharedSummary} onChange={(e) => change({ sharedSummary: e.target.value })} />
        </CardContent>
      </Card>

      {session && session.status === 'SCHEDULED' && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} /> Mark the session as done
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={empty} loading={create.isPending || update.isPending || updateSession.isPending} onClick={publish}>
          {isPublished ? 'Save changes' : 'Save note'}
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href={`/mentor/clients/detail?id=${clientId}&tab=notes`}>{noteState?.isDraft ? 'Keep as draft' : 'Cancel'}</Link>
        </Button>
      </div>
    </div>
  );
}
