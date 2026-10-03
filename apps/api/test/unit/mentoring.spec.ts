import { addDays } from '../../src/domain/dates';
import { clientStatus, DaySignal, inQuietHours, PrepFacts, renderTemplate, talkingPoints, whatsappLink } from '../../src/domain/mentoring';

const TODAY = '2026-10-15';
const NOW = new Date('2026-10-15T06:00:00Z');
const day = (offset: number, pct: number, checkIn = true, opts: Partial<DaySignal> = {}): DaySignal => ({
  date: addDays(TODAY, offset),
  plannedCount: 4,
  completionPercentage: pct,
  checkInCompleted: checkIn,
  isRestDay: false,
  isFinal: true,
  ...opts,
});
const status = (days: DaySignal[], lastActiveAt: Date | null = NOW) => clientStatus({ days, today: TODAY, lastActiveAt, createdAt: new Date('2026-09-01T00:00:00Z'), now: NOW });

describe('clientStatus', () => {
  it('is on track with good recent days', () => {
    expect(status([day(-1, 90), day(-2, 100), day(-3, 80)]).status).toBe('ON_TRACK');
  });

  it('needs attention after 3 active days under 60% in a row', () => {
    const r = status([day(-1, 50), day(-2, 40), day(-3, 55)]);
    expect(r.status).toBe('NEEDS_ATTENTION');
    expect(r.reasons).toContain('Under 60% for 3 active days in a row');
  });

  it('skips rest days when looking for 3 active days in a row', () => {
    const r = status([day(-1, 50), day(-2, 0, false, { isRestDay: true, plannedCount: 0 }), day(-3, 40), day(-4, 30)]);
    expect(r.status).toBe('NEEDS_ATTENTION');
  });

  it("needs attention when yesterday's check-in was missed", () => {
    expect(status([day(-1, 90, false), day(-2, 90)]).reasons).toEqual(["Missed yesterday's check-in"]);
  });

  it('watches one missed check-in or a day under 50% in the last 3 days', () => {
    expect(status([day(-1, 90), day(-2, 90, false)]).status).toBe('WATCH');
    expect(status([day(-1, 90), day(-3, 45)]).status).toBe('WATCH');
    expect(status([day(-1, 90), day(-5, 10, false)]).status).toBe('ON_TRACK');
  });

  it('ignores today and open (not final) days', () => {
    expect(status([day(0, 0, false), day(-1, 30, false, { isFinal: false })]).status).toBe('ON_TRACK');
  });

  it('is inactive after 3 days without activity, before any other rule', () => {
    const r = status([day(-1, 0, false)], new Date(NOW.getTime() - 3 * 86_400_000));
    expect(r).toEqual({ status: 'INACTIVE', reasons: ['No activity for 3 days'] });
  });
});

describe('nudges', () => {
  it('renders templates with the client name and streak', () => {
    expect(renderTemplate('GREAT_STREAK', { name: 'Aravind', streak: 12 })).toBe('Great work, Aravind! You’re on a 12-day streak. Keep going.');
  });

  it.each([
    ['21:59', false],
    ['22:00', true],
    ['03:00', true],
    ['06:59', true],
    ['07:00', false],
  ])('quiet hours wrap past midnight: %s → %s', (t, quiet) => {
    expect(inQuietHours(t)).toBe(quiet);
  });

  it('builds a wa.me link from an international number', () => {
    expect(whatsappLink('+91 98765-43210', 'Hi & bye')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
  });
});

describe('talkingPoints', () => {
  const base: PrepFacts = {
    completionNow: 70,
    completionBefore: 70,
    checkInsMissed: 0,
    streak: 0,
    confidenceFirst: 3,
    confidenceLast: 3,
    blockers: [],
    commitments: [],
    openActions: [],
    today: TODAY,
  };

  it('suggests nothing when nothing stands out', () => {
    expect(talkingPoints(base)).toEqual([]);
  });

  it('puts celebrations first, then follow-ups, then questions, then adjustments', () => {
    const points = talkingPoints({
      ...base,
      streak: 12,
      completionNow: 50,
      completionBefore: 80,
      blockers: [{ reason: 'TOO_BUSY', count: 4 }],
      commitments: [{ title: 'Interview prep', planned: 7, completionRate: 40 }],
      openActions: [{ title: 'Mock interview', owner: 'CLIENT', dueDate: '2026-10-10' }],
    });
    expect(points.map((p) => p.kind)).toEqual(['CELEBRATE', 'FOLLOW_UP', 'EXPLORE', 'EXPLORE', 'ADJUST']);
    expect(points[0].text).toBe('Celebrate the 12-day streak first.');
    expect(points[1].text).toContain('was due 2026-10-10');
    expect(points[2].text).toBe('Completion fell from 80% to 50%: ask what changed.');
    expect(points[3].text).toBe('“Too busy” came up 4 times: ask what took the time and agree a fixed slot.');
    expect(points[4].text).toBe('“Interview prep” is at 40%: consider a smaller target or a different time.');
  });

  it('flags falling or low confidence and missed check-ins', () => {
    expect(talkingPoints({ ...base, confidenceFirst: 5, confidenceLast: 2 }).map((p) => p.id)).toEqual(['confidence-drop']);
    expect(talkingPoints({ ...base, confidenceFirst: 2, confidenceLast: 2 }).map((p) => p.id)).toEqual(['confidence-low']);
    expect(talkingPoints({ ...base, checkInsMissed: 2 }).map((p) => p.id)).toEqual(['checkins']);
  });

  it('needs at least 3 occurrences before judging a commitment', () => {
    expect(talkingPoints({ ...base, commitments: [{ title: 'X', planned: 2, completionRate: 0 }] })).toEqual([]);
  });

  it('caps the list at 8 points', () => {
    const commitments = Array.from({ length: 12 }, (_, i) => ({ title: `C${i}`, planned: 5, completionRate: 10 }));
    expect(talkingPoints({ ...base, commitments })).toHaveLength(8);
  });
});
