'use client';
import Link from 'next/link';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/states';
import { useCheckInToday, useSubmitCheckIn } from './api';
import { buildPayload, initialState, reducer, validateStep, visibleSteps } from './model';
import { BlockersStep, ConfidenceStep, ReflectionStep, StatusStep } from './steps';
import { ResultView } from './result-view';

/** Guided check-in (spec §17): statuses → blockers (only if something slipped) → confidence → reflection → submit. */
export function CheckInFlow() {
  const q = useCheckInToday();
  const submit = useSubmitCheckIn();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [editing, setEditing] = useState(false);
  const items = useMemo(() => (q.data?.items ?? []).filter((i) => i.status !== 'SKIPPED'), [q.data]);

  useEffect(() => {
    if (q.data) dispatch({ type: 'load', items: q.data.items, prior: q.data.checkIn });
    // Load once per fetched check-in; refetches after submit must not wipe the result screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.date]);

  if (q.isPending) return <PageSkeleton label="Loading today’s check-in" blocks={['h-8 w-60', 'h-24', 'h-24', 'h-24']} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (submit.data) return <ResultView result={submit.data} />;

  const data = q.data;
  const done = data.checkIn.status === 'COMPLETED' || data.checkIn.status === 'LATE';

  if (done && !editing) {
    return (
      <div className="grid gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">Today’s check-in</h1>
        <Card>
          <CardContent className="grid gap-3 p-5">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-5 text-success" aria-hidden /> Checked in{data.checkIn.status === 'LATE' ? ' (late)' : ''} · {data.checkIn.completionPercentage}% complete
            </p>
            {data.checkIn.reflection && <p className="text-sm text-muted-foreground">“{data.checkIn.reflection}”</p>}
            <p className="text-sm text-muted-foreground">You can update today’s check-in until midnight.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                Update check-in
              </Button>
              <Button asChild variant="ghost">
                <Link href="/app/dashboard">Back to today</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to check in today"
        description="There are no commitments scheduled today. Enjoy the rest — or set up a goal to start tracking."
        action={
          <Button asChild variant="outline">
            <Link href="/app/goals">Go to goals</Link>
          </Button>
        }
      />
    );
  }

  const steps = visibleSteps(items, state.answers);
  const index = Math.min(state.step, steps.length - 1);
  const current = steps[index];
  const isLast = index === steps.length - 1;

  const next = () => {
    const problem = validateStep(current, items, state);
    if (problem) return dispatch({ type: 'error', message: problem });
    if (isLast) submit.mutate(buildPayload(items, state));
    else dispatch({ type: 'goto', step: index + 1 });
  };

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(data.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={cn('h-1.5 flex-1 rounded-full', i <= index ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          Step {index + 1} of {steps.length}
        </p>
      </div>

      {current === 'status' && <StatusStep items={items} state={state} dispatch={dispatch} />}
      {current === 'blockers' && <BlockersStep state={state} dispatch={dispatch} />}
      {current === 'confidence' && <ConfidenceStep state={state} dispatch={dispatch} />}
      {current === 'reflection' && <ReflectionStep state={state} dispatch={dispatch} />}

      {state.error && <InlineAlert>{state.error}</InlineAlert>}
      {submit.isError && (
        <InlineAlert>
          Your check-in couldn’t be saved. {errorMessage(submit.error)}{' '}
          <button type="button" className="font-semibold underline" onClick={() => submit.mutate(buildPayload(items, state))}>
            Retry
          </button>
        </InlineAlert>
      )}

      <div className="sticky bottom-16 -mx-4 flex gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        {index > 0 && (
          <Button variant="outline" size="lg" onClick={() => dispatch({ type: 'goto', step: index - 1 })} disabled={submit.isPending}>
            <ArrowLeft /> Back
          </Button>
        )}
        <Button size="lg" className="flex-1" onClick={next} loading={submit.isPending}>
          {isLast ? (
            <>
              {!submit.isPending && <Check />} Submit check-in
            </>
          ) : (
            <>
              Continue <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
