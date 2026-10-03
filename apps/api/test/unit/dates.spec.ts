import {
  addDays, endOfLocalDay, isValidTimezone, isoWeekday, localTimeToUtc, startOfWeek, todayIn, toDbDate, fromDbDate,
} from '../../src/domain/dates';

describe('timezone helpers', () => {
  it('computes "today" in the user timezone, not server time', () => {
    // 2026-10-01 20:00 UTC is already Oct 2 in Kolkata (+05:30) but still Oct 1 in New York
    const now = new Date('2026-10-01T20:00:00Z');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-10-02');
    expect(todayIn('America/New_York', now)).toBe('2026-10-01');
    expect(todayIn('Europe/London', now)).toBe('2026-10-01');
  });

  it('converts a local check-in time to UTC', () => {
    expect(localTimeToUtc('2026-10-02', '21:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-02T15:30:00.000Z');
    expect(localTimeToUtc('2026-10-02', '21:00', 'America/New_York').toISOString()).toBe('2026-10-03T01:00:00.000Z');
  });

  it('handles DST transitions (New York, Nov 1 2026)', () => {
    // EDT (-4) before, EST (-5) after
    expect(localTimeToUtc('2026-10-31', '09:00', 'America/New_York').toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(localTimeToUtc('2026-11-02', '09:00', 'America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('end of local day is 23:59:59.999 local', () => {
    expect(endOfLocalDay('2026-10-02', 'Asia/Kolkata').toISOString()).toBe('2026-10-02T18:29:59.999Z');
  });

  it('date arithmetic, weekdays and week starts', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(isoWeekday('2026-10-02')).toBe(5); // Friday
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28'); // Sunday → Monday
  });

  it('validates IANA zones', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });

  it('round-trips DATE columns', () => {
    expect(fromDbDate(toDbDate('2026-10-02'))).toBe('2026-10-02');
  });
});
