import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { PrismaService } from '../database/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/env';
import { JobQueueService } from './job-queue.service';
import { JobHandlers } from './job-handlers';
import { log } from '../common/logging/logger';

export const TICK_HEARTBEAT = 'scheduler-tick';
const POLL_MS = 2_000;
const BATCH = 10;

/**
 * In-process worker + scheduler.
 *  - every minute: enqueue a `tick` job with dedupe key `tick:<minute>` (safe with many instances)
 *  - every 2 s: claim due jobs (SKIP LOCKED) and run them with bounded concurrency
 *  - writes a heartbeat that /health and the Cloudflare watchdog check
 * Disabled with JOBS_ENABLED=false (tests, HTTP-only replicas); lazy catch-up keeps the app correct regardless.
 */
@Injectable()
export class JobRunnerService implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private pollTimer?: NodeJS.Timeout;
  private tickTimer?: NodeJS.Timeout;
  private inFlight = new Set<Promise<unknown>>();
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueueService,
    private readonly handlers: JobHandlers,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.jobsEnabled) return;
    void this.scheduleTick();
    this.tickTimer = setInterval(() => void this.scheduleTick(), 60_000);
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
    log.info('job_runner_started', { workerId: this.workerId });
  }

  async onApplicationShutdown() {
    this.stopping = true;
    clearInterval(this.pollTimer);
    clearInterval(this.tickTimer);
    await Promise.allSettled([...this.inFlight]);
  }

  async scheduleTick(now: Date = new Date()) {
    try {
      const minute = Math.floor(now.getTime() / 60_000);
      await this.queue.enqueue('tick', {}, { dedupeKey: `tick:${minute}`, maxAttempts: 2, runAt: now });
      await this.queue.reclaimStale(now);
      await this.prisma.systemHeartbeat.upsert({
        where: { name: TICK_HEARTBEAT },
        create: { name: TICK_HEARTBEAT, at: now, detail: { workerId: this.workerId } },
        update: { at: now, detail: { workerId: this.workerId } },
      });
    } catch (e) {
      log.error('tick_schedule_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Claim and run one batch. Public so tests can drive the worker deterministically. */
  async poll(now: Date = new Date()): Promise<number> {
    if (this.stopping || this.inFlight.size > 0) return 0;
    const jobs = await this.queue.claim(this.workerId, BATCH, now).catch((e) => {
      log.error('job_claim_failed', { error: e instanceof Error ? e.message : String(e) });
      return [];
    });
    const runs = jobs.map((job) => {
      const started = Date.now();
      const p = this.handlers
        .run(job, now)
        .then(() => this.queue.complete(job))
        .then(() => log.info('job_done', { job: job.name, id: job.id, ms: Date.now() - started }))
        .catch(async (e) => {
          const dead = await this.queue.fail(job, e);
          log[dead ? 'error' : 'warn'](dead ? 'job_dead' : 'job_retry', { job: job.name, id: job.id, attempts: job.attempts, error: e instanceof Error ? e.message : String(e) });
        })
        .finally(() => this.inFlight.delete(p));
      this.inFlight.add(p);
      return p;
    });
    await Promise.allSettled(runs);
    return jobs.length;
  }
}
