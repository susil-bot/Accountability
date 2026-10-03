import type { Occurrence } from '@/lib/types';

/**
 * Pure check-in model: state, reducer and payload builder. No React, no I/O → unit-tested directly.
 */
export type ItemStatus = 'COMPLETED' | 'PARTIAL' | 'MISSED';
export type Answer = { status?: ItemStatus; value?: number };
export const STEPS = ['status', 'blockers', 'confidence', 'reflection'] as const;
export type Step = (typeof STEPS)[number];

export interface CheckInState {
  step: number;
  answers: Record<string, Answer>;
  blockers: string[];
  blockerNote: string;
  confidence?: number;
  reflection: string;
  /** "Keep this private": the reflection is never shown to the client's mentor. */
  reflectionPrivate: boolean;
  error: string | null;
}

export type Action =
  | { type: 'load'; items: Occurrence[]; prior: { blockers?: string[]; blockerNote?: string | null; confidence?: number | null; reflection?: string | null; reflectionPrivate?: boolean } }
  | { type: 'answer'; id: string; answer: Answer }
  | { type: 'blockers'; value: string[] }
  | { type: 'blockerNote'; value: string }
  | { type: 'confidence'; value: number }
  | { type: 'reflection'; value: string }
  | { type: 'reflectionPrivate'; value: boolean }
  | { type: 'goto'; step: number }
  | { type: 'error'; message: string | null };

export const initialState: CheckInState = { step: 0, answers: {}, blockers: [], blockerNote: '', reflection: '', reflectionPrivate: false, error: null };

export function initialAnswer(o: Occurrence): Answer {
  if (o.period === 'WEEK') return { value: o.actualValue ?? 0 };
  if (o.status === 'COMPLETED') return { status: 'COMPLETED' };
  if (o.status === 'PARTIAL' || o.status === 'IN_PROGRESS') return { status: 'PARTIAL', value: o.actualValue ?? undefined };
  if (o.status === 'MISSED') return { status: 'MISSED' };
  return {};
}

export function reducer(s: CheckInState, a: Action): CheckInState {
  switch (a.type) {
    case 'load':
      return {
        ...initialState,
        answers: Object.fromEntries(a.items.map((o) => [o.id, initialAnswer(o)])),
        blockers: a.prior.blockers ?? [],
        blockerNote: a.prior.blockerNote ?? '',
        confidence: a.prior.confidence ?? undefined,
        reflection: a.prior.reflection ?? '',
        reflectionPrivate: a.prior.reflectionPrivate ?? false,
      };
    case 'answer':
      return { ...s, error: null, answers: { ...s.answers, [a.id]: { ...s.answers[a.id], ...a.answer } } };
    case 'blockers':
      return { ...s, blockers: a.value };
    case 'blockerNote':
      return { ...s, blockerNote: a.value };
    case 'confidence':
      return { ...s, error: null, confidence: a.value };
    case 'reflection':
      return { ...s, reflection: a.value };
    case 'reflectionPrivate':
      return { ...s, reflectionPrivate: a.value };
    case 'goto':
      return { ...s, error: null, step: a.step };
    case 'error':
      return { ...s, error: a.message };
  }
}

/** The blockers step is only shown when something wasn't fully done. */
export function visibleSteps(items: Occurrence[], answers: Record<string, Answer>): Step[] {
  const shortfall = items.some((o) => o.period === 'DAY' && answers[o.id]?.status && answers[o.id]?.status !== 'COMPLETED');
  return STEPS.filter((s) => s !== 'blockers' || shortfall);
}

/** Returns an error message if the current step can't be left yet. */
export function validateStep(step: Step, items: Occurrence[], s: CheckInState): string | null {
  if (step === 'status') {
    const unanswered = items.find((o) => o.period === 'DAY' && !s.answers[o.id]?.status);
    if (unanswered) return `Choose how “${unanswered.title}” went.`;
  }
  if (step === 'confidence' && !s.confidence) return 'Choose a number from 1 to 5.';
  return null;
}

export interface CheckInItemPayload {
  occurrenceId: string;
  status: ItemStatus;
  actualValue?: number;
}

export function buildPayload(items: Occurrence[], s: CheckInState) {
  return {
    items: items.flatMap((o): CheckInItemPayload[] => {
      const a = s.answers[o.id] ?? {};
      if (o.period === 'WEEK') {
        const value = Number.isFinite(a.value) ? (a.value as number) : 0;
        return [{ occurrenceId: o.id, status: value >= o.targetValue ? 'COMPLETED' : 'PARTIAL', actualValue: value }];
      }
      if (!a.status) return [];
      const partialValue = a.status === 'PARTIAL' && a.value !== undefined && Number.isFinite(a.value) ? { actualValue: a.value } : {};
      return [{ occurrenceId: o.id, status: a.status, ...partialValue }];
    }),
    blockers: s.blockers.length ? s.blockers : undefined,
    blockerNote: s.blockerNote.trim() || undefined,
    confidence: s.confidence,
    reflection: s.reflection.trim() || undefined,
    reflectionPrivate: s.reflection.trim() ? s.reflectionPrivate : undefined,
  };
}
