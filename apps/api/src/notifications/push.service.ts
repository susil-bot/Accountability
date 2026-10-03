import { Inject, Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../database/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/env';
import { log } from '../common/logging/logger';

export interface PushMessage {
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Browser Web Push (free: VAPID keys we generate ourselves, delivered by the browser vendors' push services).
 * Works on Chrome, Edge, Firefox, Android, and iOS 16.4+ when the app is added to the home screen.
 * Endpoints the push service reports as gone (404/410) are deleted.
 */
@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    if (config.push) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  }

  get enabled() {
    return !!this.config.push;
  }

  publicKey() {
    return { enabled: this.enabled, publicKey: this.config.push?.publicKey ?? null };
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
    // An endpoint belongs to one browser profile; if another account signs in there, the endpoint moves with it.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent?.slice(0, 300) },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent?.slice(0, 300) },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    const res = await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { removed: res.count };
  }

  /** Sends to every device of the user. Throws only when every attempt failed transiently (so the job retries). */
  async sendToUser(userId: string, msg: PushMessage) {
    if (!this.config.push) return { sent: 0, skipped: 'disabled' };
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { sent: 0 };
    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.link ?? '/' });
    let sent = 0;
    let transient = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60, urgency: 'high' });
        sent++;
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        else transient++;
        log.warn('push_failed', { userId, status });
      }
    }
    if (sent === 0 && transient > 0) throw new Error(`push delivery failed for ${transient} device(s)`);
    return { sent };
  }
}
