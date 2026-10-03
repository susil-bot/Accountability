import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { AppError, conflict, notFound } from '../common/errors/app-error';
import { APP_CONFIG, AppConfig } from '../config/env';
import { presentUser } from '../users/users.presenter';
import { log } from '../common/logging/logger';

export const INVITE_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const invalidInvite = () => new AppError('INVITE_INVALID', 'This invite link is invalid or has expired. Ask your admin for a new one.', 404);

/**
 * Mentor accounts are invite-only. The admin gets a one-time link to send (WhatsApp, email…);
 * only its SHA-256 hash is stored, it expires after 7 days and works once. The mentor sets their own password.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(admin: AuthUser, input: { name: string; email: string }, now = new Date()) {
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw conflict('EMAIL_IN_USE', 'An account with this email already exists.');
    }
    const token = randomBytes(32).toString('base64url');
    const invite = await this.prisma.tx(async (tx) => {
      // A new invite replaces any earlier unused one for the same address.
      await tx.mentorInvite.updateMany({ where: { email, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      const inv = await tx.mentorInvite.create({
        data: { email, name: input.name.trim(), tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000), invitedById: admin.id },
      });
      await this.audit.record({ userId: admin.id, action: 'MENTOR_INVITED', entityType: 'MentorInvite', entityId: inv.id, metadata: { email } }, tx);
      return inv;
    });
    return { ...this.present(invite, now), inviteUrl: `${this.config.appUrl.replace(/\/$/, '')}/invite?token=${token}` };
  }

  async list(now = new Date()) {
    const rows = await this.prisma.mentorInvite.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((r) => this.present(r, now));
  }

  async revoke(admin: AuthUser, id: string) {
    const res = await this.prisma.mentorInvite.updateMany({ where: { id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw notFound('Invite');
    await this.audit.record({ userId: admin.id, action: 'MENTOR_INVITE_REVOKED', entityType: 'MentorInvite', entityId: id });
    return { id, revoked: true };
  }

  /** Public: what the invite page shows before the mentor sets a password. */
  async preview(token: string, now = new Date()) {
    const inv = await this.findUsable(token, now);
    return { name: inv.name, email: inv.email, expiresAt: inv.expiresAt };
  }

  async accept(input: { token: string; password: string; timezone: string; name?: string }, now = new Date()) {
    const inv = await this.findUsable(input.token, now);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.prisma.tx(async (tx) => {
      // Claim the invite atomically: a second concurrent accept finds usedAt already set.
      const claimed = await tx.mentorInvite.updateMany({ where: { id: inv.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count === 0) throw invalidInvite();
      if (await tx.user.findUnique({ where: { email: inv.email } })) throw conflict('EMAIL_IN_USE', 'An account with this email already exists.');
      const u = await tx.user.create({
        data: {
          name: input.name?.trim() || inv.name,
          email: inv.email,
          passwordHash,
          role: 'MENTOR',
          timezone: input.timezone,
          onboardedAt: now,
          mentorProfile: { create: {} },
          notificationPreference: { create: {} },
          subscription: { create: { plan: 'COACH', status: 'ACTIVE' } },
          streak: { create: {} },
        },
        include: { notificationPreference: true, subscription: true },
      });
      await tx.mentorInvite.update({ where: { id: inv.id }, data: { userId: u.id } });
      await this.audit.record({ userId: u.id, actorId: inv.invitedById, action: 'MENTOR_JOINED', entityType: 'User', entityId: u.id, metadata: { inviteId: inv.id } }, tx);
      return u;
    });
    log.info('mentor_joined', { userId: user.id });
    return { user: presentUser(user), token: await this.auth.issueSession(user) };
  }

  private async findUsable(token: string, now: Date) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw invalidInvite();
    const inv = await this.prisma.mentorInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.usedAt || inv.revokedAt || inv.expiresAt <= now) throw invalidInvite();
    return inv;
  }

  private present(r: { id: string; email: string; name: string; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; createdAt: Date }, now: Date) {
    const status = r.usedAt ? 'USED' : r.revokedAt ? 'REVOKED' : r.expiresAt <= now ? 'EXPIRED' : 'PENDING';
    return { id: r.id, email: r.email, name: r.name, status, expiresAt: r.expiresAt, createdAt: r.createdAt };
  }
}
