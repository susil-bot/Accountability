'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ToggleChip, toggleIn } from '@/components/ui/toggle-chip';
import { ApiError, errorMessage } from '@/lib/api';
import { CATEGORIES, hhmmTo12, targetLabel, WEEKDAYS } from '@/lib/format';
import { commitmentSchema, emptyCommitment, planWarnings, toPayload } from './commitment-schema';
import { useCreateGoal } from './api';
import { CommitmentEditor } from './commitment-editor';

const schema = z.object({
  title: z.string().trim().min(3, 'Describe your goal in a few words').max(140),
  category: z.string(),
  motivation: z.string().max(2000).optional(),
  targetDate: z.string().optional(),
  successMeasure: z.string().max(500).optional(),
  numericTarget: z.boolean(),
  targetValue: z.number().positive().optional().or(z.nan()),
  progressIndex: z.number().optional(),
  commitments: z.array(commitmentSchema).min(1, 'Add at least one commitment').max(5, 'Start with up to 5 commitments'),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time'),
  restDays: z.array(z.number()),
  prefs: z.object({ checkinReminderEnabled: z.boolean(), taskReminderEnabled: z.boolean(), weeklyReviewEnabled: z.boolean(), emailEnabled: z.boolean() }),
});
type Values = z.infer<typeof schema>;

const SUGGESTIONS: Record<string, string[]> = {
  CAREER: ['Apply to 5 jobs', 'Solve 2 DSA problems', 'Interview practice'],
  CODING: ['Code for 60 minutes', 'Ship one small PR', 'Read documentation'],
  STUDY: ['Study for 45 minutes', 'Review flashcards', 'Complete one lesson'],
  FITNESS: ['Workout', 'Walk 8,000 steps', 'Stretch for 10 minutes'],
  HEALTH: ['Sleep by 11pm', 'Drink 2L of water', 'Meditate 10 minutes'],
  FINANCE: ['Log every expense', 'Review budget', 'No impulse purchases'],
  BUSINESS: ['Reach out to 3 prospects', 'Write one post', 'Plan tomorrow'],
  PERSONAL: ['Read 20 pages', 'Journal', 'Call family'],
  OTHER: ['Work on it for 30 minutes'],
};

type StepId = 'goal' | 'why' | 'success' | 'commitments' | 'checkin' | 'notifications' | 'review';

export function GoalWizard({ mode }: { mode: 'onboarding' | 'new' }) {
  const router = useRouter();
  const create = useCreateGoal();
  const steps: StepId[] = mode === 'onboarding' ? ['goal', 'why', 'success', 'commitments', 'checkin', 'notifications', 'review'] : ['goal', 'why', 'success', 'commitments', 'checkin', 'review'];
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<{ message: string; code?: string } | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      title: '',
      category: 'CAREER',
      motivation: '',
      targetDate: '',
      successMeasure: '',
      numericTarget: false,
      targetValue: undefined,
      progressIndex: undefined,
      commitments: [emptyCommitment()],
      checkInTime: '21:00',
      restDays: [],
      prefs: { checkinReminderEnabled: true, taskReminderEnabled: true, weeklyReviewEnabled: true, emailEnabled: true },
    },
  });
  const { register, control, watch, trigger, formState, setValue, getValues } = form;
  const commitments = useFieldArray({ control, name: 'commitments' });
  const current = steps[step];
  const values = watch();
  const warnings = planWarnings(values.commitments ?? []);

  const fieldsFor: Record<StepId, FieldPath<Values>[]> = {
    goal: ['title', 'category'],
    why: ['motivation'],
    success: ['targetDate', 'successMeasure', 'targetValue'],
    commitments: ['commitments'],
    checkin: ['checkInTime', 'restDays'],
    notifications: ['prefs'],
    review: [],
  };

  async function next() {
    const ok = await trigger(fieldsFor[current]);
    if (current === 'success') {
      const v = getValues();
      if (v.numericTarget && !(Number(v.targetValue) > 0)) {
        form.setError('targetValue', { message: 'Enter a number above 0' });
        return;
      }
    }
    if (ok) setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function submit(activate = true) {
    setSubmitError(null);
    if (!(await trigger())) return;
    const v = getValues();
    const numeric = v.numericTarget && Number(v.targetValue) > 0;
    try {
      await create.mutateAsync({
        goal: {
          title: v.title.trim(),
          category: v.category,
          motivation: v.motivation || undefined,
          successMeasure: v.successMeasure || undefined,
          targetDate: v.targetDate || undefined,
          targetValue: numeric ? Number(v.targetValue) : undefined,
          targetUnit: numeric ? 'COUNT' : undefined,
          progressCommitmentIndex: numeric && v.progressIndex !== undefined ? v.progressIndex : undefined,
          checkInTime: v.checkInTime,
          restDays: v.restDays,
          activate,
          commitments: v.commitments.map(toPayload),
        },
        notificationPreferences: mode === 'onboarding' ? v.prefs : undefined,
      });
      router.replace('/app/dashboard');
    } catch (e) {
      setSubmitError({ message: errorMessage(e), code: e instanceof ApiError ? e.code : undefined });
    }
  }

  const progressPct = Math.round(((step + 1) / steps.length) * 100);
  const suggestions = (SUGGESTIONS[values.category] ?? []).filter((s) => !values.commitments.some((c) => c.title.trim().toLowerCase() === s.toLowerCase()));

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {step + 1} of {steps.length}
          </span>
          {mode === 'onboarding' && step === 0 && <span>About 2 minutes</span>}
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (current === 'review') void submit(true);
          else void next();
        }}
        noValidate
      >
        {current === 'goal' && (
          <section aria-labelledby="s-goal" className="grid gap-5">
            <div>
              <h1 id="s-goal" className="text-2xl font-semibold tracking-tight">
                {mode === 'onboarding' ? 'Welcome. What do you want to achieve?' : 'What do you want to achieve?'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">One meaningful goal. You’ll break it into small daily actions next.</p>
            </div>
            <Field id="title" label="Your goal" error={formState.errors.title?.message}>
              <Input id="title" autoFocus placeholder="e.g. Get a new software engineering job" aria-invalid={!!formState.errors.title} {...register('title')} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Category</legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <ToggleChip key={c.value} shape="pill" pressed={values.category === c.value} onPressedChange={() => setValue('category', c.value)}>
                    {c.label}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
          </section>
        )}

        {current === 'why' && (
          <section aria-labelledby="s-why" className="grid gap-5">
            <div>
              <h1 id="s-why" className="text-2xl font-semibold tracking-tight">
                Why is this important?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">You’ll see this on hard days. Optional, but worth a sentence.</p>
            </div>
            <Field id="motivation" label="Your reason">
              <Textarea id="motivation" rows={4} placeholder="e.g. I want work that challenges me and a stable income." {...register('motivation')} />
            </Field>
          </section>
        )}

        {current === 'success' && (
          <section aria-labelledby="s-success" className="grid gap-5">
            <div>
              <h1 id="s-success" className="text-2xl font-semibold tracking-tight">
                When, and how will you know?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Goals are never marked complete automatically — you confirm it.</p>
            </div>
            <Field id="targetDate" label="Target date" hint="Optional">
              <Input id="targetDate" type="date" {...register('targetDate')} />
            </Field>
            <Field id="successMeasure" label="How will you measure success?">
              <Input id="successMeasure" placeholder="e.g. Job offer received" {...register('successMeasure')} />
            </Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...register('numericTarget')} />
              <span>
                <span className="font-medium">Track a numeric target</span>
                <span className="block text-muted-foreground">e.g. “Apply to 150 jobs” — progress is counted from one commitment.</span>
              </span>
            </label>
            {values.numericTarget && (
              <Field id="targetValue" label="Target number" error={formState.errors.targetValue?.message}>
                <Input id="targetValue" type="number" inputMode="numeric" min={1} className="w-40" {...register('targetValue', { valueAsNumber: true })} />
              </Field>
            )}
          </section>
        )}

        {current === 'commitments' && (
          <section aria-labelledby="s-commit" className="grid gap-5">
            <div>
              <h1 id="s-commit" className="text-2xl font-semibold tracking-tight">
                What actions will you commit to?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Small and specific beats ambitious and vague. 2–4 is a good start.</p>
            </div>
            {commitments.fields.map((f, i) => (
              <div key={f.id} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">Commitment {i + 1}</span>
                  {commitments.fields.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => commitments.remove(i)} aria-label={`Remove commitment ${i + 1}`}>
                      <Trash2 /> Remove
                    </Button>
                  )}
                </div>
                <CommitmentEditor prefix={`commitments.${i}`} idPrefix={`c${i}`} control={control} register={register} watch={watch} errors={formState.errors.commitments?.[i]} />
                {values.numericTarget && values.commitments[i]?.targetUnit === 'COUNT' && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="radio" name="progressIndex" className="size-4 accent-[var(--primary)]" checked={values.progressIndex === i} onChange={() => setValue('progressIndex', i)} />
                    Counts towards my goal target
                  </label>
                )}
              </div>
            ))}
            {formState.errors.commitments?.root?.message && (
              <p role="alert" className="text-sm font-medium text-danger">
                {formState.errors.commitments.root.message}
              </p>
            )}
            {commitments.fields.length < 5 && (
              <div className="grid gap-3">
                <Button type="button" variant="outline" onClick={() => commitments.append(emptyCommitment())}>
                  <Plus /> Add commitment
                </Button>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ideas:</span>
                    {suggestions.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => {
                          const empty = values.commitments.findIndex((c) => !c.title.trim());
                          if (empty >= 0) setValue(`commitments.${empty}.title`, s, { shouldValidate: true });
                          else commitments.append(emptyCommitment(s));
                        }}
                        className="h-9 rounded-full border border-dashed border-input px-3 text-xs hover:bg-muted"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {warnings.map((w) => (
              <p key={w} className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </p>
            ))}
          </section>
        )}

        {current === 'checkin' && (
          <section aria-labelledby="s-checkin" className="grid gap-5">
            <div>
              <h1 id="s-checkin" className="text-2xl font-semibold tracking-tight">
                When will you check in?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">A two-minute review of the day. We’ll remind you at this time, and once more an hour later if needed.</p>
            </div>
            <Field id="checkInTime" label="Daily check-in time" error={formState.errors.checkInTime?.message}>
              <Input id="checkInTime" type="time" className="w-40" {...register('checkInTime')} />
            </Field>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Rest days</legend>
              <p className="mb-2 text-xs text-muted-foreground">Nothing is scheduled on rest days and they never break your streak.</p>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d) => (
                  <ToggleChip key={d.iso} className="px-0 text-xs" pressed={values.restDays.includes(d.iso)} onPressedChange={(on) => setValue('restDays', toggleIn(values.restDays, d.iso, on))}>
                    {d.short}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
          </section>
        )}

        {current === 'notifications' && (
          <section aria-labelledby="s-notif" className="grid gap-5">
            <div>
              <h1 id="s-notif" className="text-2xl font-semibold tracking-tight">
                How should we remind you?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Few, useful reminders. Change these anytime in Settings.</p>
            </div>
            {(
              [
                ['checkinReminderEnabled', 'Check-in reminders', 'At your check-in time, plus one follow-up.'],
                ['taskReminderEnabled', 'Commitment reminders', 'At a commitment’s preferred time.'],
                ['weeklyReviewEnabled', 'Weekly review', 'A summary of your week every Sunday.'],
                ['emailEnabled', 'Email', 'Send reminders by email as well as in the app.'],
              ] as const
            ).map(([k, title, desc]) => (
              <label key={k} className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...register(`prefs.${k}`)} />
                <span>
                  <span className="font-medium">{title}</span>
                  <span className="block text-muted-foreground">{desc}</span>
                </span>
              </label>
            ))}
          </section>
        )}

        {current === 'review' && (
          <section aria-labelledby="s-review" className="grid gap-5">
            <div>
              <h1 id="s-review" className="text-2xl font-semibold tracking-tight">
                Review your plan
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Today’s commitments are created as soon as you activate.</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <Badge tone="primary">{CATEGORIES.find((c) => c.value === values.category)?.label}</Badge>
              <h2 className="mt-2 text-lg font-semibold">{values.title}</h2>
              {values.motivation && <p className="mt-1 text-sm text-muted-foreground">“{values.motivation}”</p>}
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Target date</dt>
                  <dd className="font-medium">{values.targetDate || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Success</dt>
                  <dd className="font-medium">{values.successMeasure || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Check-in</dt>
                  <dd className="font-medium">{values.checkInTime ? hhmmTo12(values.checkInTime) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rest days</dt>
                  <dd className="font-medium">{values.restDays.length ? WEEKDAYS.filter((d) => values.restDays.includes(d.iso)).map((d) => d.short).join(', ') : 'None'}</dd>
                </div>
              </dl>
            </div>
            <ul className="grid gap-2">
              {values.commitments.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
                  <span className="font-medium">{c.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {c.scheduleType === 'TIMES_PER_WEEK'
                      ? `${c.timesPerWeek}× / week`
                      : `${targetLabel(c.targetValue, c.targetUnit, c.customUnitLabel)} · ${c.scheduleType === 'DAILY' ? 'daily' : `${c.days.length} days/wk`}`}
                  </span>
                </li>
              ))}
            </ul>
            {warnings.map((w) => (
              <p key={w} className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </p>
            ))}
            {submitError && (
              <div role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {submitError.message}
                {submitError.code === 'PLAN_LIMIT_REACHED' && (
                  <Button type="button" variant="link" className="ml-1 h-auto text-danger" onClick={() => submit(false)}>
                    Save as draft instead
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        <div className="sticky bottom-0 -mx-5 mt-8 flex gap-3 border-t bg-background/95 px-5 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={() => setStep((s) => s - 1)} disabled={create.isPending}>
              <ArrowLeft /> Back
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" loading={create.isPending}>
            {current === 'review' ? (
              <>
                {!create.isPending && <Check />} Activate goal
              </>
            ) : (
              <>
                Continue <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
