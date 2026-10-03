import { Injectable } from '@nestjs/common';
import { Job } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MaintenanceService } from './maintenance.service';
import { JobQueueService } from './job-queue.service';
import { EvidenceCleanupService } from '../evidence/evidence-cleanup.service';
import { MentoringJobsService } from '../mentoring/mentoring-jobs.service';
import { SessionsService } from '../mentoring/sessions.service';
import { PushService } from '../notifications/push.service';
import { log } from '../common/logging/logger';

/** Every 15 minutes each user gets a maintenance pass, computed in their own timezone. */
export const MAINTENANCE_SLOT_MS = 15 * 60 * 1000;
const PAGE = 500;

export type JobName = 'tick' | 'user-maintenance' | 'cleanup-uploads' | 'purge-jobs' | 'session-reminder' | 'push';

/** Maps job names to handlers. Each handler must be idempotent: jobs are retried. */
@Injectable()
export class JobHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueueService,
    private readonly maintenance: MaintenanceService,
    private readonly uploads: EvidenceCleanupService,
    private readonly mentoring: MentoringJobsService,
    private readonly sessions: SessionsService,
    private readonly push: PushService,
  ) {}

  async run(job: Job, now: Date = new Date()): Promise<unknown> {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    switch (job.name as JobName) {
      case 'tick':
        return this.tick(now);
      case 'user-maintenance': {
        const result = await this.maintenance.runForUser(String(payload.userId), now);
        const mentoring = await this.mentoring.runForUser(String(payload.userId), now);
        return { ...result, mentoring };
      }
      case 'session-reminder':
        return this.sessions.sendReminder(payload as { sessionId: string; startsAt: number; lead: number; who: 'mentor' | 'client' }, now);
      case 'push':
        return this.push.sendToUser(String(payload.userId), { title: String(payload.title), body: String(payload.body), link: (payload.link as string | null) ?? null });
      case 'cleanup-uploads':
        return this.uploads.removeExpired(now);
      case 'purge-jobs':
        return this.queue.purgeFinished(7, now);
      default:
        throw new Error(`Unknown job "${job.name}"`);
    }
  }

  /** Runs once per minute (deduped across instances). Fans out per-user work on 15-minute slots. */
  async tick(now: Date) {
    const minute = Math.floor(now.getTime() / 60_000);
    const slot = Math.floor(now.getTime() / MAINTENANCE_SLOT_MS);
    let fannedOut = 0;
    if (!(await this.slotStarted(slot))) {
      let cursor: string | undefined;
      for (;;) {
        const users = await this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: PAGE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (users.length === 0) break;
        fannedOut += await this.queue.enqueueMany(users.map((u) => ({ name: 'user-maintenance', payload: { userId: u.id }, opts: { dedupeKey: `maint:${u.id}:${slot}`, maxAttempts: 3, runAt: now } })));
        cursor = users[users.length - 1].id;
        if (users.length < PAGE) break;
      }
      await this.queue.enqueue('cleanup-uploads', {}, { dedupeKey: `cleanup-uploads:${slot}`, runAt: now });
    }
    if (minute % (24 * 60) === 0) await this.queue.enqueue('purge-jobs', {}, { dedupeKey: `purge-jobs:${minute}`, runAt: now });
    if (fannedOut > 0) log.info('tick_fanned_out', { users: fannedOut, slot });
    return { fannedOut };
  }

  private async slotStarted(slot: number) {
    const hb = await this.prisma.systemHeartbeat.findUnique({ where: { name: 'maintenance-slot' } });
    if ((hb?.detail as { slot?: number } | null)?.slot === slot) return true;
    await this.prisma.systemHeartbeat.upsert({
      where: { name: 'maintenance-slot' },
      create: { name: 'maintenance-slot', at: new Date(), detail: { slot } },
      update: { at: new Date(), detail: { slot } },
    });
    return false;
  }
}
