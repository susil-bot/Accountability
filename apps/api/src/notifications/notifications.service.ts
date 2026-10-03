import { Inject, Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { Db, PrismaService } from '../database/prisma.service';
import { notFound } from '../common/errors/app-error';
import { UpdatePreferencesDto } from './notifications.dto';
import { JobQueueService } from '../jobs/job-queue.service';
import { APP_CONFIG, AppConfig } from '../config/env';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  dedupeKey: string;
  title: string;
  body: string;
  scheduledAt: Date;
  /** In-app path opened from the notification. */
  link?: string;
  /** Who the notification is about (mentor alerts). */
  subjectId?: string;
}

/**
 * In-app notification store. Rows are created idempotently via UNIQUE(userId, dedupeKey),
 * so jobs can run any number of times without spamming. Delivery channels (email/push/WhatsApp)
 * plug in behind a provider interface in Phase 5; until then rows are "SENT" to the in-app inbox.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueueService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Creates the in-app notification once (UNIQUE userId+dedupeKey). When Web Push is configured, a push
   * delivery job is queued in the same transaction, so a rolled-back write never sends a push.
   */
  async createOnce(db: Db, n: NewNotification): Promise<boolean> {
    const res = await db.notification.createMany({
      data: [{ ...n, status: 'SENT', sentAt: new Date() }],
      skipDuplicates: true,
    });
    const created = res.count > 0;
    if (created && this.config.push) {
      await this.queue.enqueue(
        'push',
        { userId: n.userId, title: n.title, body: n.body, link: n.link ?? null },
        { dedupeKey: `push:${n.userId}:${n.dedupeKey}`, maxAttempts: 3 },
        db,
      );
    }
    return created;
  }

  async list(userId: string, opts: { unreadOnly?: boolean; limit?: number }) {
    const take = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, id: string) {
    const res = await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    if (res.count === 0) throw notFound('Notification');
    return { id, read: true };
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: res.count };
  }

  getPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    return this.prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...dto }, update: dto });
  }
}
