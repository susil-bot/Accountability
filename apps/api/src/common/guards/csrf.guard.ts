import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppError } from '../errors/app-error';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { SESSION_COOKIE } from './auth.guard';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'accountability-web';

/**
 * CSRF defence in depth for cookie sessions:
 *  1. Session cookie is SameSite=Lax (blocks cross-site POSTs carrying the cookie).
 *  2. Mutations must send a custom header — browsers cannot add it cross-origin without a CORS preflight,
 *     which this API never grants to foreign origins.
 *  3. If an Origin header is present it must match APP_URL.
 * Bearer-token clients (no cookie) are not CSRF-exposed and skip the check.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
    if (SAFE.has(req.method)) return true;
    const usesCookie = !!req.cookies?.[SESSION_COOKIE];
    if (!usesCookie) return true;

    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins().includes(origin)) {
      throw new AppError('CSRF_REJECTED', 'Request origin is not allowed.', 403);
    }
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new AppError('CSRF_REJECTED', 'Missing request verification header.', 403);
    }
    return true;
  }

  private allowedOrigins() {
    return [new URL(this.config.appUrl).origin, `http://localhost:${this.config.port}`];
  }
}
