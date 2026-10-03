'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { CATEGORIES } from '@/lib/format';
import type { GoalCategory } from '@/lib/types';
import { useMentorProfile, useUpdateMentorProfile } from './api';

/** What clients see when they choose a mentor; also whether this mentor accepts new clients. */
export function DirectoryProfileCard() {
  const q = useMentorProfile();
  const save = useUpdateMentorProfile();
  const toast = useToast();
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [areas, setAreas] = useState<GoalCategory[]>([]);
  const [languages, setLanguages] = useState('');
  const [accepting, setAccepting] = useState(true);

  useEffect(() => {
    if (!q.data) return;
    setHeadline(q.data.headline ?? '');
    setBio(q.data.bio ?? '');
    setAreas(q.data.focusAreas);
    setLanguages(q.data.languages.join(', '));
    setAccepting(q.data.acceptingClients);
  }, [q.data]);

  if (!q.data) return <Skeleton className="h-96" />;
  const p = q.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your mentor profile</CardTitle>
        <CardDescription>
          Clients see this when they choose a mentor. You have {p.activeClients} of {p.capacity} spots filled (your admin sets the limit).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!p.listed && (
          <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            {p.acceptingClients ? 'Clients can’t find you yet. Add a headline or a short bio so you appear in the mentor directory.' : 'You’re hidden from the mentor directory because you aren’t accepting new clients.'}
          </p>
        )}
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} />
          <span>
            Accepting new clients
            <span className="block text-xs text-muted-foreground">When off, you’re hidden from the directory. Your current clients and admin assignments are unaffected.</span>
          </span>
        </label>
        <Field id="mp-headline" label="Headline" hint="One line, e.g. “Career coach · former hiring manager”.">
          <Input id="mp-headline" maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </Field>
        <Field id="mp-bio" label="About you" hint={`${bio.length}/1000`}>
          <Textarea id="mp-bio" rows={4} maxLength={1000} placeholder="Who you help, and how." value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Focus areas</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => (
              <ToggleChip
                key={c.value}
                className="h-8 text-xs"
                pressed={areas.includes(c.value as GoalCategory)}
                onPressedChange={(on) => setAreas((x) => (on ? [...x, c.value as GoalCategory] : x.filter((y) => y !== c.value)))}
              >
                {c.label}
              </ToggleChip>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Clients with goals in these areas see you as a good match.</p>
        </fieldset>
        <Field id="mp-lang" label="Languages" hint="Separate with commas.">
          <Input id="mp-lang" placeholder="English, Tamil" value={languages} onChange={(e) => setLanguages(e.target.value)} />
        </Field>
        <Button
          className="justify-self-start"
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              {
                headline: headline.trim() || null,
                bio: bio.trim() || null,
                focusAreas: areas,
                languages: languages.split(',').map((l) => l.trim()).filter(Boolean).slice(0, 8),
                acceptingClients: accepting,
              },
              { onSuccess: () => toast({ tone: 'success', message: 'Profile saved' }), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
            )
          }
        >
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}
