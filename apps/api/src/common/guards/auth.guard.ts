import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { AppError } from '../errors/app-error';
import { AuthUser, IS_PUBLIC, ROLES } from '../decorators/auth.decorators';
import { Role } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/env';

export const SESSION_COOKIE = 'acc_session';

export interface SessionPayload {
  sub: string;
  role: Role;
  tv: number;
}

/**
 * Global authentication guard. Session = signed JWT in an httpOnly, SameSite=Lax cookie
 * (Bearer header also accepted for API clients/tests). The user row is re-loaded on each
 * request so deactivated users and revoked sessions (tokenVersion) are rejected immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
    }

    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token, { secret: this.config.jwtSecret });
    } catch {
      if (isPublic) return true;
      throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      if (isPublic) return true;
      throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      timezone: user.timezone,
      checkInTime: user.checkInTime,
      restDays: user.restDays,
    };

    // Cheap activity tracking (throttled to once per 5 minutes).
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60_000) {
      void this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      throw new AppError('FORBIDDEN', 'You do not have access to this resource.', 403);
    }
    return true;
  }
}

export function extractToken(req: Request): string | undefined {
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}
