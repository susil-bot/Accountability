import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { Public, RawResponse } from '../common/decorators/auth.decorators';
import { APP_CONFIG, AppConfig } from '../config/env';
import { TICK_HEARTBEAT } from '../jobs/job-runner.service';

/** The scheduler ticks every minute; 3 missed ticks = degraded. */
const TICK_STALE_MS = 3 * 60_000;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Liveness + readiness for deploys and the Cloudflare watchdog:
   * { status, database, jobs, lastTickAt, deadJobs }. 503 when degraded.
   * Redis was removed (jobs run on Postgres), so the queue's own heartbeat replaces the Redis check.
   */
  /** Process liveness only (no database): for platform health checks that restart the container. */
  @Public()
  @RawResponse()
  @SkipThrottle()
  @Get('live')
  live() {
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }

  @Public()
  @RawResponse()
  @SkipThrottle()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    let database: 'ok' | 'error' = 'ok';
    let jobs: 'ok' | 'stale' | 'disabled' | 'unknown' = this.config.jobsEnabled ? 'unknown' : 'disabled';
    let lastTickAt: Date | null = null;
    let deadJobs = 0;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const [hb, dead] = await Promise.all([this.prisma.systemHeartbeat.findUnique({ where: { name: TICK_HEARTBEAT } }), this.prisma.job.count({ where: { status: 'DEAD' } })]);
      lastTickAt = hb?.at ?? null;
      deadJobs = dead;
      // Right after a (re)start or a wake-up from idle the scheduler hasn't ticked yet: don't report stale then.
      const warmingUp = process.uptime() * 1000 < TICK_STALE_MS;
      if (this.config.jobsEnabled) jobs = lastTickAt && Date.now() - lastTickAt.getTime() < TICK_STALE_MS ? 'ok' : warmingUp ? 'unknown' : 'stale';
    } catch {
      database = 'error';
    }
    const ok = database === 'ok' && jobs !== 'stale';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', database, jobs, lastTickAt, deadJobs };
  }
}
