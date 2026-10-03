import { describe, expect, it } from 'vitest';
import type { Occurrence } from '@/lib/types';
import { buildPayload, initialState, reducer, validateStep, visibleSteps } from './model';

const occ = (over: Partial<Occurrence>): Occurrence => ({
  id: 'o1',
  taskId: 't',
  commitmentId: 'c',
  goalId: 'g',
  title: 'Apply to jobs',
  period: 'DAY',
  scheduledDate: '2026-10-02',
  scheduledStartTime: '',
  scheduledEndTime: '',
  preferredTime: null,
  status: 'PENDING',
  targetValue: 5,
  targetUnit: 'COUNT',
  unitLabel: null,
  actualValue: null,
  completionPercentage: 0,
  requiresEvidence: false,
  evidenceCount: 0,
  completedAt: null,
  completedLate: false,
  missedAt: null,
  editable: true,
  dayOpen: true,
  ...over,
});

describe('check-in model', () => {
  const items = [occ({ id: 'a' }), occ({ id: 'b', title: 'Read', targetUnit: 'BOOLEAN', targetValue: 1, status: 'COMPLETED', actualValue: 1 }), occ({ id: 'w', period: 'WEEK', title: 'Workout', targetValue: 4, actualValue: 2 })];
  const loaded = reducer(initialState, { type: 'load', items, prior: { confidence: null } });

  it('prefills answers from current task state', () => {
    expect(loaded.answers.a).toEqual({});
    expect(loaded.answers.b).toEqual({ status: 'COMPLETED' });
    expect(loaded.answers.w).toEqual({ value: 2 });
  });

  it('requires every daily task to be answered before continuing', () => {
    expect(validateStep('status', items, loaded)).toMatch(/Apply to jobs/);
    const answered = reducer(loaded, { type: 'answer', id: 'a', answer: { status: 'PARTIAL', value: 3 } });
    expect(validateStep('status', items, answered)).toBeNull();
  });

  it('only shows the blockers step when something slipped', () => {
    const allDone = reducer(loaded, { type: 'answer', id: 'a', answer: { status: 'COMPLETED' } });
    expect(visibleSteps(items, allDone.answers)).toEqual(['status', 'confidence', 'reflection']);
    const slipped = reducer(loaded, { type: 'answer', id: 'a', answer: { status: 'MISSED' } });
    expect(visibleSteps(items, slipped.answers)).toEqual(['status', 'blockers', 'confidence', 'reflection']);
  });

  it('requires a confidence score', () => {
    expect(validateStep('confidence', items, loaded)).toMatch(/1 to 5/);
    expect(validateStep('confidence', items, reducer(loaded, { type: 'confidence', value: 4 }))).toBeNull();
  });

  it('builds the API payload', () => {
    let s = reducer(loaded, { type: 'answer', id: 'a', answer: { status: 'PARTIAL', value: 3 } });
    s = reducer(s, { type: 'blockers', value: ['TOO_BUSY'] });
    s = reducer(s, { type: 'confidence', value: 4 });
    s = reducer(s, { type: 'reflection', value: '  good day  ' });
    expect(buildPayload(items, s)).toEqual({
      items: [
        { occurrenceId: 'a', status: 'PARTIAL', actualValue: 3 },
        { occurrenceId: 'b', status: 'COMPLETED' },
        { occurrenceId: 'w', status: 'PARTIAL', actualValue: 2 },
      ],
      blockers: ['TOO_BUSY'],
      blockerNote: undefined,
      confidence: 4,
      reflection: 'good day',
      reflectionPrivate: false,
    });
  });

  it('marks a reflection private, and sends no flag without a reflection', () => {
    let s = reducer(loaded, { type: 'reflection', value: 'personal' });
    s = reducer(s, { type: 'reflectionPrivate', value: true });
    expect(buildPayload(items, s).reflectionPrivate).toBe(true);
    s = reducer(s, { type: 'reflection', value: '   ' });
    expect(buildPayload(items, s).reflectionPrivate).toBeUndefined();
  });
});
