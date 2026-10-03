import { originSecretMiddleware } from '../../src/common/guards/origin-secret.middleware';

function run(secret: string | undefined, path: string, headers: Record<string, string> = {}) {
  const req = { path, headers } as unknown as Parameters<ReturnType<typeof originSecretMiddleware>>[0];
  let status = 0;
  const res = { status: (s: number) => ((status = s), res), json: () => res } as unknown as Parameters<ReturnType<typeof originSecretMiddleware>>[1];
  let passed = false;
  originSecretMiddleware(secret)(req, res, () => (passed = true));
  return { passed, status, clientIp: (req as { clientIp?: string }).clientIp };
}

describe('originSecretMiddleware', () => {
  const S = 'x'.repeat(40);
  it('is a no-op when no secret is configured', () => {
    expect(run(undefined, '/api/v1/auth/me').passed).toBe(true);
  });
  it('rejects direct requests with 404 and accepts the proxy', () => {
    expect(run(S, '/api/v1/auth/me')).toMatchObject({ passed: false, status: 404 });
    expect(run(S, '/api/v1/auth/me', { 'x-origin-secret': 'nope' })).toMatchObject({ passed: false, status: 404 });
    expect(run(S, '/api/v1/auth/me', { 'x-origin-secret': S, 'x-client-ip': '203.0.113.9' })).toMatchObject({ passed: true, clientIp: '203.0.113.9' });
  });
  it('keeps /health open for uptime monitors, without trusting a client IP', () => {
    expect(run(S, '/health', { 'x-client-ip': '1.2.3.4' })).toMatchObject({ passed: true, clientIp: undefined });
  });
});
