import { canAutoMiss, checkInSchedule, checkInWindow, submissionStatus } from '../../src/domain/checkin';

describe('check-in deadlines (Asia/Kolkata, 21:00)', () => {
  const s = checkInSchedule('2026-10-02', '21:00', 'Asia/Kolkata');
  const at = (local: string) => new Date(`2026-10-02T${local}+05:30`);

  it('schedules reminder, follow-up and close in local time', () => {
    expect(s.scheduledAt.toISOString()).toBe('2026-10-02T15:30:00.000Z');
    expect(s.followUpAt.toISOString()).toBe('2026-10-02T16:30:00.000Z');
    expect(s.closesAt.toISOString()).toBe('2026-10-02T18:29:59.999Z');
  });

  it('moves through the windows', () => {
    expect(checkInWindow(s, at('12:00:00'))).toBe('BEFORE_REMINDER');
    expect(checkInWindow(s, at('21:30:00'))).toBe('OPEN');
    expect(checkInWindow(s, at('22:15:00'))).toBe('FOLLOW_UP');
    expect(checkInWindow(s, new Date('2026-10-02T18:30:00.000Z'))).toBe('CLOSED');
  });

  it('records on-time, late and rejected submissions', () => {
    expect(submissionStatus(s, at('08:00:00'))).toBe('COMPLETED');
    expect(submissionStatus(s, at('21:59:00'))).toBe('COMPLETED');
    expect(submissionStatus(s, at('23:30:00'))).toBe('LATE');
    expect(submissionStatus(s, new Date('2026-10-02T19:00:00Z'))).toBeNull();
  });

  it('clamps follow-up to the end of day for late check-in times', () => {
    const late = checkInSchedule('2026-10-02', '23:30', 'Asia/Kolkata');
    expect(late.followUpAt.getTime()).toBe(late.closesAt.getTime());
  });

  it('never auto-misses a task before its scheduled end', () => {
    const end = new Date('2026-10-02T18:29:59.999Z');
    expect(canAutoMiss(end, new Date('2026-10-02T18:00:00Z'))).toBe(false);
    expect(canAutoMiss(end, new Date('2026-10-02T18:30:00Z'))).toBe(true);
  });
});
