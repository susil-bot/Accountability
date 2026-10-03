import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, AppConfig } from '../config/env';
import { RegisterDto, LoginDto } from './auth.dto';
import { presentUser } from '../users/users.presenter';
import { SessionPayload } from '../common/guards/auth.guard';
import { log } from '../common/logging/logger';

const BCRYPT_ROUNDS = 12;
// Pre-computed hash so unknown-email logins cost the same as wrong-password logins (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new AppError('EMAIL_IN_USE', 'An account with this email already exists.', 409);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.tx(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          timezone: dto.timezone,
          notificationPreference: { create: {} },
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
          streak: { create: {} },
        },
        include: { notificationPreference: true, subscription: true },
      });
      await this.audit.record({ userId: u.id, action: 'USER_REGISTERED', entityType: 'User', entityId: u.id }, tx);
      return u;
    });
    log.info('user_registered', { userId: user.id });
    return { user: presentUser(user), token: await this.sign(user.id, user.role, user.tokenVersion) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { notificationPreference: true, subscription: true },
    });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
    if (!user.isActive) throw new AppError('ACCOUNT_DISABLED', 'This account has been disabled.', 403);
    log.info('user_logged_in', { userId: user.id });
    return { user: presentUser(user), token: await this.sign(user.id, user.role, user.tokenVersion) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { notificationPreference: true, subscription: true },
    });
    return presentUser(user);
  }

  /** Invalidate every existing session for the user. */
  async logoutEverywhere(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.isProd,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: this.config.sessionTtlDays * 24 * 60 * 60 * 1000,
    };
  }

  /** Session token for a user created outside register/login (e.g. a mentor accepting an invite). */
  issueSession(user: { id: string; role: SessionPayload['role']; tokenVersion: number }) {
    return this.sign(user.id, user.role, user.tokenVersion);
  }

  private sign(sub: string, role: SessionPayload['role'], tv: number) {
    const payload: SessionPayload = { sub, role, tv };
    return this.jwt.signAsync(payload, { secret: this.config.jwtSecret, expiresIn: `${this.config.sessionTtlDays}d` });
  }
}
