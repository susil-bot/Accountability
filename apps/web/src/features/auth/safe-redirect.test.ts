import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-redirect';

describe('safeNext (open-redirect guard)', () => {
  it('accepts in-app paths', () => {
    expect(safeNext('/app/calendar?date=2026-10-01')).toBe('/app/calendar?date=2026-10-01');
  });
  it.each([null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])('rejects %s', (v) => {
    expect(safeNext(v)).toBe('/app/dashboard');
  });
});
