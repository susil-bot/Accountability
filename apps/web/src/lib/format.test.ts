import { describe, expect, it } from 'vitest';
import { formatDate, hhmmTo12, progressLabel, targetLabel, unitSuffix } from './format';

describe('format', () => {
  it('labels progress by unit', () => {
    expect(progressLabel(20, 30, 'MINUTES')).toBe('20 / 30 min');
    expect(progressLabel(null, 5, 'COUNT')).toBe('0 / 5');
    expect(progressLabel(1, 1, 'BOOLEAN')).toBe('Done');
    expect(progressLabel(0, 1, 'BOOLEAN')).toBe('Not done yet');
    expect(progressLabel(2.5, 5, 'CUSTOM', 'pages')).toBe('2.5 / 5 pages');
  });
  it('labels targets', () => {
    expect(targetLabel(30, 'MINUTES')).toBe('30 min');
    expect(targetLabel(1, 'BOOLEAN')).toBe('Done / not done');
    expect(unitSuffix('CUSTOM', 'pages')).toBe('pages');
  });
  it('formats calendar dates without timezone drift', () => {
    expect(formatDate('2026-10-02', { day: 'numeric', month: 'numeric', year: 'numeric' })).toMatch(/2/);
    expect(formatDate('2026-01-01', { year: 'numeric' })).toBe('2026');
  });
  it('formats HH:mm', () => {
    expect(hhmmTo12('21:00')).toMatch(/9:00/);
  });
});
