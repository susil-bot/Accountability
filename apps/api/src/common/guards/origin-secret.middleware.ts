import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const ORIGIN_SECRET_HEADER = 'x-origin-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Production origin lock. When ORIGIN_SECRET is set, the API only answers requests that come through the
 * Cloudflare Pages proxy (which adds the secret); anyone hitting the server's address directly gets 404.
 * Because only the proxy can reach us, the client IP it forwards can be trusted for rate limiting.
 * `/health` stays open (it reveals nothing) so uptime monitors can reach it.
 */
export function originSecretMiddleware(secret: string | undefined) {
  return (req: Request & { clientIp?: string }, res: Response, next: NextFunction) => {
    if (!secret) return next();
    if (req.path === '/health' || req.path === '/health/live') return next();
    const got = req.headers[ORIGIN_SECRET_HEADER];
    if (typeof got !== 'string' || !same(got, secret)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } });
      return;
    }
    const ip = req.headers[CLIENT_IP_HEADER];
    if (typeof ip === 'string' && ip.length <= 64) req.clientIp = ip;
    next();
  };
}
