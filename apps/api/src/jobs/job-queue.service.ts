import { Injectable } from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { Db, PrismaService } from '../database/prisma.service';
import { table } from '../database/sql';

export interface EnqueueOptions {
  /** Earliest time the job may run (default: now). */
  runAt?: Date;
  /** Idempotency key: a second enqueue with the same key is ignored. */
  dedupeKey?: string;
  maxAttempts?: number;
}

/** Exponential backoff with a cap: 30s, 2m, 8m, 32m, 2h… */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, attempt - 1), 2 * 60 * 60 * 1000);
}

/** A RUNNING job whose worker vanished (crash, deploy) is reclaimed after this long. */
export const STALE_LOCK_MS = 5 * 60 * 1000;

/**
 * Postgres-backed job queue (replaces Redis + BullMQ, so the free deployment needs one fewer service).
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so any number of API instances can run workers safely.
 */
@Injectable()
export class JobQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(name: string, payload: Prisma.InputJsonValue = {}, opts: EnqueueOptions = {}, db: Db = this.prisma): Promise<boolean> {
    const res = await db.job.createMany({
      data: [{ name, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 5 }],
      skipDuplicates: true,
    });
    return res.count > 0;
  }

  async enqueueMany(jobs: { name: string; payload?: Prisma.InputJsonValue; opts?: EnqueueOptions }[], db: Db = this.prisma): Promise<number> {
    if (jobs.length === 0) return 0;
    const res = await db.job.createMany({
      data: jobs.map((j) => ({ name: j.name, payload: j.payload ?? {}, runAt: j.opts?.runAt ?? new Date(), dedupeKey: j.opts?.dedupeKey, maxAttempts: j.opts?.maxAttempts ?? 5 })),
      skipDuplicates: true,
    });
    return res.count;
  }

  /** Atomically claim up to `limit` due jobs for this worker. */
  async claim(workerId: string, limit: number, now: Date = new Date()): Promise<Job[]> {
    return this.prisma.$queryRaw<Job[]>`
      UPDATE ${table('Job')} SET "status" = 'RUNNING', "lockedAt" = ${now}, "lockedBy" = ${workerId}, "attempts" = "attempts" + 1, "updatedAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM ${table('Job')}
        WHERE "status" = 'QUEUED' AND "runAt" <= ${now}
        ORDER BY "runAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "name", "payload", "status"::text AS "status", "runAt", "attempts", "maxAttempts", "dedupeKey", "lockedAt", "lockedBy", "lastError", "finishedAt", "createdAt", "updatedAt"`;
  }

  async complete(job: Job, now: Date = new Date()) {
    await this.prisma.job.updateMany({ where: { id: job.id, lockedBy: job.lockedBy }, data: { status: 'DONE', finishedAt: now, lockedAt: null, lastError: null } });
  }

  /** Retry with backoff, or park as DEAD after maxAttempts (visible to admins, never silently lost). */
  async fail(job: Job, error: unknown, now: Date = new Date()) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    const dead = job.attempts >= job.maxAttempts;
    await this.prisma.job.updateMany({
      where: { id: job.id, lockedBy: job.lockedBy },
      data: dead
        ? { status: 'DEAD', finishedAt: now, lockedAt: null, lastError: message }
        : { status: 'QUEUED', runAt: new Date(now.getTime() + backoffMs(job.attempts)), lockedAt: null, lockedBy: null, lastError: message },
    });
    return dead;
  }

  /** Put jobs whose worker died back in the queue. */
  async reclaimStale(now: Date = new Date()): Promise<number> {
    const res = await this.prisma.job.updateMany({
      where: { status: 'RUNNING', lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
      data: { status: 'QUEUED', lockedAt: null, lockedBy: null, runAt: now },
    });
    return res.count;
  }

  async purgeFinished(olderThanDays = 7, now: Date = new Date()): Promise<number> {
    const res = await this.prisma.job.deleteMany({ where: { status: 'DONE', finishedAt: { lt: new Date(now.getTime() - olderThanDays * 86_400_000) } } });
    return res.count;
  }

  stats() {
    return this.prisma.job.groupBy({ by: ['status'], _count: { _all: true } });
  }
}
