import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';
import { log } from './logger';

const VALID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Correlation ids + structured access log.
 * Accepts an upstream X-Request-Id (Cloudflare / load balancer) when well-formed, otherwise mints one,
 * echoes it on the response, and logs one line per request with status and duration.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && VALID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/health') return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const user = (req as Request & { user?: { id: string } }).user;
    log[res.statusCode >= 500 ? 'error' : 'info']('http_request', {
      requestId,
      method: req.method,
      route: req.route?.path ?? req.path.replace(/[0-9a-f-]{36}/gi, ':id'),
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      userId: user?.id,
    });
  });
  requestContext.run({ requestId }, () => next());
}
