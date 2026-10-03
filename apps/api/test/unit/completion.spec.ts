import { actualForStatus, completionPercentage, evaluateCompletion, statusFromPercentage } from '../../src/domain/completion';

describe('completion rules', () => {
  it('maps percentages to statuses', () => {
    expect(statusFromPercentage(0)).toBe('MISSED');
    expect(statusFromPercentage(1)).toBe('PARTIAL');
    expect(statusFromPercentage(49)).toBe('PARTIAL');
    expect(statusFromPercentage(50)).toBe('PARTIAL');
    expect(statusFromPercentage(99)).toBe('PARTIAL');
    expect(statusFromPercentage(100)).toBe('COMPLETED');
  });

  it('computes percentages against the target', () => {
    expect(evaluateCompletion(20, 30, 'MINUTES')).toEqual({ completionPercentage: 66, status: 'PARTIAL' });
    expect(evaluateCompletion(5, 5, 'COUNT')).toEqual({ completionPercentage: 100, status: 'COMPLETED' });
    expect(evaluateCompletion(0, 5, 'COUNT')).toEqual({ completionPercentage: 0, status: 'MISSED' });
  });

  it('caps over-achievement at 100%', () => {
    expect(completionPercentage(8, 5, 'COUNT')).toBe(100);
  });

  it('treats BOOLEAN as done / not done', () => {
    expect(evaluateCompletion(1, 1, 'BOOLEAN').status).toBe('COMPLETED');
    expect(evaluateCompletion(0, 1, 'BOOLEAN').status).toBe('MISSED');
  });

  it('never returns a percentage for negative or NaN input', () => {
    expect(completionPercentage(-3, 5, 'COUNT')).toBe(0);
    expect(completionPercentage(Number.NaN, 5, 'COUNT')).toBe(0);
  });

  it('derives actual values from explicit check-in choices', () => {
    expect(actualForStatus('COMPLETED', 30, 'MINUTES')).toBe(30);
    expect(actualForStatus('MISSED', 30, 'MINUTES')).toBe(0);
    expect(actualForStatus('PARTIAL', 30, 'MINUTES', 20)).toBe(20);
    expect(actualForStatus('PARTIAL', 30, 'MINUTES')).toBe(15);
    expect(actualForStatus('PARTIAL', 30, 'MINUTES', 45)).toBe(15); // a "partial" ≥ target is not partial
  });
});
