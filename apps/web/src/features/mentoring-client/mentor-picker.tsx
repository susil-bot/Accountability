'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, Languages, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, InlineAlert } from '@/components/ui/states';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { ApiError, errorMessage } from '@/lib/api';
import { CATEGORIES } from '@/lib/format';
import { firstName, initials, type DirectoryMentor, type MyMentor } from '@/lib/mentoring';
import type { GoalCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useChooseMentor, useMentorDirectory } from './api';

const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;
type Step = 'browse' | 'confirm' | 'done';

/**
 * Choose a mentor in three steps: browse (search, filter, best match first) → confirm (what will be shared,
 * an optional intro) → done (what happens next). Choosing is consent: sharing starts immediately.
 */
export function MentorPicker({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: MyMentor['assignment'] }) {
  const directory = useMentorDirectory(open);
  const choose = useChooseMentor();
  const [step, setStep] = useState<Step>('browse');
  const [selected, setSelected] = useState<DirectoryMentor | null>(null);
  const [q, setQ] = useState('');
  const [area, setArea] = useState<GoalCategory | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('browse');
    setSelected(null);
    setMessage('');
    setNotice(null);
    choose.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset each time the picker opens
  }, [open]);

  const areas = useMemo(() => [...new Set((directory.data ?? []).flatMap((m) => m.focusAreas))], [directory.data]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (directory.data ?? []).filter(
      (m) =>
        (!onlyAvailable || m.available || m.current) &&
        (!area || m.focusAreas.includes(area)) &&
        (!term || [m.name, m.headline, m.bio, ...m.languages, ...m.focusAreas.map(categoryLabel)].some((t) => t?.toLowerCase().includes(term))),
    );
  }, [directory.data, q, area, onlyAvailable]);

  const switching = !!current && current.status === 'ACTIVE' && selected?.id !== current.mentor.id;
  const submit = () =>
    selected &&
    choose.mutate(
      { mentorId: selected.id, message: message.trim() || undefined },
      {
        onSuccess: () => setStep('done'),
        onError: (e) => {
          // Someone took the last spot (or the mentor closed their list) while we were deciding: back to the list.
          if (e instanceof ApiError && (e.code === 'MENTOR_AT_CAPACITY' || e.code === 'MENTOR_NOT_ACCEPTING')) {
            setNotice(e.message);
            setSelected(null);
            setStep('browse');
          }
        },
      },
    );

  const title = step === 'browse' ? (current?.status === 'ACTIVE' ? 'Change your mentor' : 'Choose your mentor') : step === 'confirm' ? `Confirm ${selected ? firstName(selected.name) : ''}` : 'You’re all set';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        title={title}
        description={step === 'browse' ? 'Pick someone whose experience fits your goal. You can change mentor later.' : step === 'confirm' ? 'Check what you’re sharing, then confirm.' : undefined}
      >
        {step === 'browse' && (
          <div className="grid gap-4">
            {notice && <InlineAlert tone="warning">{notice}</InlineAlert>}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input className="pl-9" type="search" placeholder="Search by name, skill or language" aria-label="Search mentors" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by focus area">
              <ToggleChip className="h-8 text-xs" pressed={!area} onPressedChange={() => setArea(null)}>
                All areas
              </ToggleChip>
              {areas.map((a) => (
                <ToggleChip key={a} className="h-8 text-xs" pressed={area === a} onPressedChange={(on) => setArea(on ? a : null)}>
                  {categoryLabel(a)}
                </ToggleChip>
              ))}
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Only with free spots
              </label>
            </div>

            {directory.isPending ? (
              <div className="grid gap-2" role="status" aria-label="Loading mentors">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : directory.isError ? (
              <ErrorState message={errorMessage(directory.error)} onRetry={() => directory.refetch()} />
            ) : list.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {directory.data.length === 0 ? 'No mentors are available yet. Your admin can assign one to you.' : 'No mentors match. Try clearing the filters.'}
              </p>
            ) : (
              <ul className="grid max-h-[55dvh] gap-2 overflow-y-auto pr-1" aria-label="Mentors">
                {list.map((m) => (
                  <li key={m.id}>
                    <MentorCard m={m} selected={selected?.id === m.id} onSelect={() => setSelected(m)} />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {selected ? (
                  <>
                    Selected: <span className="font-medium text-foreground">{selected.name}</span>
                  </>
                ) : (
                  'Select a mentor to continue.'
                )}
              </p>
              <Button size="lg" disabled={!selected || selected.current} onClick={() => setStep('confirm')}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && selected && (
          <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-xl border p-3">
              <Avatar name={selected.name} />
              <div className="min-w-0">
                <p className="font-semibold">{selected.name}</p>
                {selected.headline && <p className="truncate text-sm text-muted-foreground">{selected.headline}</p>}
              </div>
            </div>
            {switching && current && (
              <InlineAlert tone="warning">
                {current.mentor.name} will stop seeing your progress straight away, and any calls you’ve booked with them will be cancelled.
              </InlineAlert>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-success-soft/60 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Eye className="size-4" aria-hidden /> {firstName(selected.name)} will see
                </p>
                <ul className="mt-2 grid gap-1 text-muted-foreground">
                  <li>Your goals, commitments and daily progress</li>
                  <li>Check-ins, blockers and confidence</li>
                  <li>Reflections (except ones you mark private)</li>
                  <li>Evidence you upload</li>
                </ul>
              </div>
              <div className="rounded-xl bg-muted p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <EyeOff className="size-4" aria-hidden /> {firstName(selected.name)} won’t see
                </p>
                <ul className="mt-2 grid gap-1 text-muted-foreground">
                  <li>Your email or password</li>
                  <li>Your phone number, unless you turn on WhatsApp contact</li>
                  <li>Your account settings</li>
                  <li>They can’t change anything in your plan</li>
                </ul>
              </div>
            </div>
            <Field id="mentor-intro" label={`Anything ${firstName(selected.name)} should know? (optional)`} hint={`${message.length}/500 · sent with your request`}>
              <Textarea
                id="mentor-intro"
                rows={3}
                maxLength={500}
                placeholder="e.g. I keep skipping interview prep in the evenings. I’d like help staying consistent."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            {choose.isError && !(choose.error instanceof ApiError && ['MENTOR_AT_CAPACITY', 'MENTOR_NOT_ACCEPTING'].includes(choose.error.code)) && <InlineAlert>{errorMessage(choose.error)}</InlineAlert>}
            <p className="text-xs text-muted-foreground">You can stop sharing or change mentor at any time in Settings.</p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep('browse')} disabled={choose.isPending}>
                <ArrowLeft /> Back
              </Button>
              <Button size="lg" loading={choose.isPending} onClick={submit}>
                <Check /> Make {firstName(selected.name)} my mentor
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && selected && (
          <div className="grid gap-4">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <CheckCircle2 className="size-12 text-success" aria-hidden />
              <p className="text-lg font-semibold">{selected.name} is now your mentor</p>
              <p className="text-sm text-muted-foreground">They’ve been notified and can see your progress from today.</p>
            </div>
            <ol className="grid gap-2 text-sm">
              <NextStep n={1}>{firstName(selected.name)} will review your goal and reach out, usually to book a first call.</NextStep>
              <NextStep n={2}>
                <Link href="/app/settings#mentor" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onOpenChange(false)}>
                  Let {firstName(selected.name)} contact you on WhatsApp
                </Link>{' '}
                (optional).
              </NextStep>
              <NextStep n={3}>
                <Link href="/app/settings" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onOpenChange(false)}>
                  Turn on notifications
                </Link>{' '}
                so you don’t miss messages and call reminders.
              </NextStep>
            </ol>
            <Button size="lg" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MentorCard({ m, selected, onSelect }: { m: DirectoryMentor; selected: boolean; onSelect: () => void }) {
  const disabled = !m.available && !m.current;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'grid w-full gap-2 rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        selected ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={m.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{m.name}</span>
            {m.current && <Badge tone="primary">Your mentor</Badge>}
            {m.matches.length > 0 && !m.current && (
              <Badge tone="success">
                <Sparkles className="size-3" aria-hidden /> Good match for {m.matches.map(categoryLabel).join(', ')}
              </Badge>
            )}
          </div>
          {m.headline && <p className="text-sm text-muted-foreground">{m.headline}</p>}
        </div>
        <span className={cn('shrink-0 text-xs font-medium', m.available ? 'text-success' : 'text-muted-foreground')}>
          {m.current ? '' : m.available ? `${m.spotsLeft} spot${m.spotsLeft === 1 ? '' : 's'} left` : 'Fully booked'}
        </span>
        {selected && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
      </div>
      {m.bio && <p className="line-clamp-3 text-sm">{m.bio}</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {m.focusAreas.map((a) => (
          <Badge key={a}>{categoryLabel(a)}</Badge>
        ))}
        {m.languages.length > 0 && (
          <span className="ml-1 inline-flex items-center gap-1">
            <Languages className="size-3.5" aria-hidden /> {m.languages.join(', ')}
          </span>
        )}
      </div>
    </button>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground', className)}>
      {initials(name)}
    </span>
  );
}

function NextStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{n}</span>
      <span>{children}</span>
    </li>
  );
}
