'use client';
import { Check, Minus, X } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { ToggleChip, toggleIn } from '@/components/ui/toggle-chip';
import { BLOCKERS, unitSuffix } from '@/lib/format';
import type { Occurrence } from '@/lib/types';
import type { Action, CheckInState, ItemStatus } from './model';

type StepProps = { state: CheckInState; dispatch: (a: Action) => void };

export function StatusStep({ items, state, dispatch }: StepProps & { items: Occurrence[] }) {
  return (
    <section aria-labelledby="h-status" className="grid gap-4">
      <h1 id="h-status" className="text-2xl font-semibold tracking-tight">
        How did you do today?
      </h1>
      <ul className="grid gap-3">
        {items.map((o) => {
          const a = state.answers[o.id] ?? {};
          return (
            <li key={o.id} className="rounded-xl border bg-card p-4">
              <p className="mb-3 font-medium" id={`t-${o.id}`}>
                {o.title}
              </p>
              {o.period === 'WEEK' ? (
                <div className="flex items-center gap-3 text-sm">
                  <label htmlFor={`w-${o.id}`} className="text-muted-foreground">
                    Times this week
                  </label>
                  <Input
                    id={`w-${o.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-24"
                    value={Number.isFinite(a.value) ? a.value : ''}
                    onChange={(e) => dispatch({ type: 'answer', id: o.id, answer: { value: e.target.valueAsNumber } })}
                  />
                  <span className="text-muted-foreground">of {o.targetValue}</span>
                </div>
              ) : (
                <>
                  <Segmented<ItemStatus>
                    label={`${o.title} status`}
                    value={a.status}
                    onChange={(v) => dispatch({ type: 'answer', id: o.id, answer: { status: v } })}
                    options={[
                      { value: 'COMPLETED', label: <><Check aria-hidden /> Done</>, tone: 'success' },
                      ...(o.targetUnit !== 'BOOLEAN' ? [{ value: 'PARTIAL' as const, label: <><Minus aria-hidden /> Partly</>, tone: 'warning' as const }] : []),
                      { value: 'MISSED', label: <><X aria-hidden /> Missed</>, tone: 'danger' },
                    ]}
                  />
                  {a.status === 'PARTIAL' && (
                    <div className="mt-3 flex items-center gap-3 text-sm">
                      <label htmlFor={`p-${o.id}`} className="text-muted-foreground">
                        How much?
                      </label>
                      <Input
                        id={`p-${o.id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className="w-24"
                        value={Number.isFinite(a.value) ? a.value : ''}
                        onChange={(e) => dispatch({ type: 'answer', id: o.id, answer: { value: e.target.valueAsNumber } })}
                      />
                      <span className="text-muted-foreground">
                        of {o.targetValue} {unitSuffix(o.targetUnit, o.unitLabel)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BlockersStep({ state, dispatch }: StepProps) {
  return (
    <section aria-labelledby="h-block" className="grid gap-4">
      <h1 id="h-block" className="text-2xl font-semibold tracking-tight">
        What got in the way?
      </h1>
      <p className="-mt-2 text-sm text-muted-foreground">No judgement — this helps spot patterns. Pick any that apply.</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="h-block">
        {BLOCKERS.map((b) => (
          <ToggleChip
            key={b.value}
            pressed={state.blockers.includes(b.value)}
            onPressedChange={(on) => dispatch({ type: 'blockers', value: toggleIn(state.blockers, b.value, on) })}
            className="min-h-12 text-left"
          >
            {b.label}
          </ToggleChip>
        ))}
      </div>
      <label htmlFor="blocker-note" className="text-sm font-medium">
        Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Input id="blocker-note" value={state.blockerNote} maxLength={500} onChange={(e) => dispatch({ type: 'blockerNote', value: e.target.value })} placeholder="e.g. Work ran late" />
    </section>
  );
}

export function ConfidenceStep({ state, dispatch }: StepProps) {
  return (
    <section aria-labelledby="h-conf" className="grid gap-4">
      <h1 id="h-conf" className="text-2xl font-semibold tracking-tight">
        How confident are you about tomorrow?
      </h1>
      <Segmented<string>
        label="Confidence about tomorrow, 1 to 5"
        size="lg"
        value={state.confidence ? String(state.confidence) : undefined}
        onChange={(v) => dispatch({ type: 'confidence', value: Number(v) })}
        options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))}
      />
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>Not confident</span>
        <span>Very confident</span>
      </div>
    </section>
  );
}

export function ReflectionStep({ state, dispatch }: StepProps) {
  return (
    <section aria-labelledby="h-refl" className="grid gap-4">
      <h1 id="h-refl" className="text-2xl font-semibold tracking-tight">
        What went well today?
      </h1>
      <p className="-mt-2 text-sm text-muted-foreground">Optional. One sentence is plenty.</p>
      <Textarea aria-labelledby="h-refl" rows={4} maxLength={2000} value={state.reflection} onChange={(e) => dispatch({ type: 'reflection', value: e.target.value })} placeholder="e.g. Finished applications before lunch." />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--primary)]"
          checked={state.reflectionPrivate}
          onChange={(e) => dispatch({ type: 'reflectionPrivate', value: e.target.checked })}
        />
        <span>
          Keep this private
          <span className="block text-xs text-muted-foreground">Your mentor won’t see this reflection.</span>
        </span>
      </label>
    </section>
  );
}
