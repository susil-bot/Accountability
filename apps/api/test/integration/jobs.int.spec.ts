import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { JobQueueService, backoffMs } from '../../src/jobs/job-queue.service';
import { JobRunnerService } from '../../src/jobs/job-runner.service';
import { createApp, registerUser, resetDb, threeCommitments } from './helpers';

describe('Postgres job queue (integration)', () => {
  let app: INestApplication;
  let queue: JobQueueService;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await createApp();
    queue = app.get(JobQueueService);
    prisma = app.get(PrismaService);
    await resetDb(app);
  });
  afterAll(async () => app.close());
  beforeEach(async () => prisma.job.deleteMany());

  it('dedupes by key', async () => {
    expect(await queue.enqueue('purge-jobs', {}, { dedupeKey: 'k1' })).toBe(true);
    expect(await queue.enqueue('purge-jobs', {}, { dedupeKey: 'k1' })).toBe(false);
    expect(await prisma.job.count()).toBe(1);
  });

  it('never hands the same job to two workers (SKIP LOCKED)', async () => {
    await queue.enqueueMany(Array.from({ length: 20 }, (_, i) => ({ name: 'purge-jobs', opts: { dedupeKey: `p${i}` } })));
    const [a, b, c] = await Promise.all([queue.claim('w1', 10), queue.claim('w2', 10), queue.claim('w3', 10)]);
    const ids = [...a, ...b, ...c].map((j) => j.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it('respects runAt', async () => {
    await queue.enqueue('purge-jobs', {}, { runAt: new Date(Date.now() + 60_000) });
    expect(await queue.claim('w', 10)).toHaveLength(0);
    expect(await queue.claim('w', 10, new Date(Date.now() + 61_000))).toHaveLength(1);
  });

  it('retries with backoff, then parks the job as DEAD', async () => {
    await queue.enqueue('purge-jobs', {}, { maxAttempts: 2 });
    let [job] = await queue.claim('w', 1);
    expect(await queue.fail(job, new Error('boom'))).toBe(false);
    const queued = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(queued).toMatchObject({ status: 'QUEUED', lastError: 'boom' });
    expect(queued.runAt.getTime()).toBeGreaterThan(Date.now() + backoffMs(1) - 5_000);
    [job] = await queue.claim('w', 1, new Date(Date.now() + 10 * 60_000));
    expect(await queue.fail(job, new Error('boom again'))).toBe(true);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('DEAD');
  });

  it('reclaims jobs from a crashed worker', async () => {
    await queue.enqueue('purge-jobs');
    await queue.claim('dead-worker', 1);
    expect(await queue.reclaimStale(new Date(Date.now() + 6 * 60_000))).toBe(1);
    expect(await queue.claim('w', 1, new Date(Date.now() + 6 * 60_000))).toHaveLength(1);
  });

  it('the scheduler tick is idempotent per minute and fans out per-user maintenance', async () => {
    const u = await registerUser(app);
    await u.client.post('/goals', { title: 'Study', category: 'STUDY', commitments: [threeCommitments[1]] });
    const runner = app.get(JobRunnerService);
    const now = new Date();
    await runner.scheduleTick(now);
    await runner.scheduleTick(now);
    expect(await prisma.job.count({ where: { name: 'tick' } })).toBe(1);
    expect(await prisma.systemHeartbeat.findUnique({ where: { name: 'scheduler-tick' } })).not.toBeNull();

    await runner.poll(now); // runs tick → enqueues user-maintenance + cleanup
    expect(await prisma.job.count({ where: { name: 'user-maintenance' } })).toBeGreaterThanOrEqual(1);
    await runner.poll(now); // runs the maintenance jobs
    const maint = await prisma.job.findMany({ where: { name: 'user-maintenance' } });
    expect(maint.map((j) => [j.status, j.lastError])).toEqual(maint.map(() => ['DONE', null]));
    expect(await prisma.job.count({ where: { status: 'DEAD' } })).toBe(0);
  });
});
