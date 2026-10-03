import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { APP_CONFIG, AppConfig } from '../../src/config/env';
import { PrismaService } from '../../src/database/prisma.service';
import { pgConfigFromUrl } from '../../src/database/pg-config';
import { CSRF_HEADER, CSRF_VALUE } from '../../src/common/guards/csrf.guard';

export async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ logger: false });
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const schema = pgConfigFromUrl(process.env.DATABASE_URL!).schema ?? 'public';
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = ${schema} AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${schema}"."${t.tablename}"`).join(', ')} CASCADE`);
}

/**
 * A timezone where it is currently ~10:00 local, so tests never straddle local midnight
 * or the check-in follow-up window, regardless of when CI runs.
 */
export function midMorningTimezone(now = new Date()) {
  let n = (now.getUTCHours() - 10 + 24) % 24;
  if (n > 12) n -= 24;
  // Etc/GMT+N means UTC−N (POSIX sign inversion)
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : ''}${n}`;
}

/** Cookie-carrying client that sends the CSRF header on mutations, like the web app does. */
export class Client {
  agent: ReturnType<typeof request.agent>;
  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }
  get(url: string) {
    return this.agent.get(`/api/v1${url}`);
  }
  post(url: string, body?: object) {
    return this.agent.post(`/api/v1${url}`).set(CSRF_HEADER, CSRF_VALUE).send(body ?? {});
  }
  patch(url: string, body?: object) {
    return this.agent.patch(`/api/v1${url}`).set(CSRF_HEADER, CSRF_VALUE).send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.agent.put(`/api/v1${url}`).set(CSRF_HEADER, CSRF_VALUE).send(body ?? {});
  }
  delete(url: string) {
    return this.agent.delete(`/api/v1${url}`).set(CSRF_HEADER, CSRF_VALUE);
  }
  /** PUT raw bytes to a signed storage URL (relative URL from the local driver). */
  putSigned(url: string, body: Buffer, contentType: string) {
    return this.agent.put(url).set(CSRF_HEADER, CSRF_VALUE).set('Content-Type', contentType).send(body);
  }

  /** Full direct-upload flow: ticket → PUT bytes to storage → confirm. Returns the confirm response. */
  async uploadEvidence(taskOccurrenceId: string, body: Buffer, contentType: string, opts: { thumbnail?: Buffer; declaredType?: string } = {}) {
    const ticket = await this.post('/evidence/uploads', {
      taskOccurrenceId,
      contentType: opts.declaredType ?? contentType,
      size: body.length,
      ...(opts.thumbnail ? { thumbnailContentType: 'image/png', thumbnailSize: opts.thumbnail.length } : {}),
    });
    if (ticket.status !== 201) return ticket;
    const { key, uploadUrl, thumbnailKey, thumbnailUploadUrl } = ticket.body.data;
    const put = await this.putSigned(uploadUrl, body, contentType);
    if (put.status !== 200) return put;
    if (opts.thumbnail && thumbnailUploadUrl) await this.putSigned(thumbnailUploadUrl, opts.thumbnail, 'image/png');
    return this.post('/evidence', {
      taskOccurrenceId,
      type: (opts.declaredType ?? contentType) === 'application/pdf' ? 'FILE' : 'IMAGE',
      uploadKey: key,
      thumbnailKey: thumbnailKey ?? undefined,
      originalName: 'proof.png',
    });
  }
}

let counter = 0;
export async function registerUser(app: INestApplication, opts: { timezone?: string; name?: string } = {}) {
  const client = new Client(app);
  const email = `user${Date.now()}${counter++}@test.dev`;
  const res = await client.post('/auth/register', {
    name: opts.name ?? 'Test User',
    email,
    password: 'Password123',
    timezone: opts.timezone ?? midMorningTimezone(),
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, user: res.body.data.user as { id: string; timezone: string }, email };
}

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const threeCommitments = [
  { title: 'Apply to 5 jobs', recurrence: { type: 'DAILY' }, targetValue: 5, targetUnit: 'COUNT' },
  { title: 'Interview prep', recurrence: { type: 'DAILY' }, targetValue: 30, targetUnit: 'MINUTES' },
  { title: 'Read docs', recurrence: { type: 'DAILY' }, targetValue: 1, targetUnit: 'BOOLEAN', evidenceRequired: false },
];

/** A timezone where the local hour is currently `hour` (±30 min), for quiet-hours and morning-summary tests. */
export function timezoneAt(hour: number, now = new Date()) {
  let n = (now.getUTCHours() - hour + 24) % 24;
  if (n > 12) n -= 24;
  if (n < -14 || n > 12) throw new Error('no Etc/GMT zone for that offset');
  return n === 0 ? 'Etc/GMT' : `Etc/GMT${n > 0 ? '+' : ''}${n}`;
}

/** Admins are created from the command line, never the website; tests insert one directly. */
export async function createAdmin(app: INestApplication, opts: { timezone?: string } = {}) {
  const prisma = app.get(PrismaService);
  const bcrypt = await import('bcryptjs');
  const email = `admin${Date.now()}${counter++}@test.dev`;
  const user = await prisma.user.create({
    data: { name: 'Ada Admin', email, passwordHash: await bcrypt.hash('Password123', 4), role: 'ADMIN', timezone: opts.timezone ?? midMorningTimezone(), onboardedAt: new Date() },
  });
  const client = new Client(app);
  const res = await client.post('/auth/login', { email, password: 'Password123' });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return { client, user };
}

/** Full invite flow: admin invites → the mentor opens the link and sets a password (signed in by the response). */
export async function inviteMentor(app: INestApplication, admin: Client, opts: { name?: string; timezone?: string } = {}) {
  const email = `mentor${Date.now()}${counter++}@test.dev`;
  const inv = await admin.post('/admin/mentors/invite', { name: opts.name ?? 'Mia Mentor', email });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const token = new URL(inv.body.data.inviteUrl).searchParams.get('token')!;
  const client = new Client(app);
  const res = await client.post('/auth/accept-invite', { token, password: 'Password123', timezone: opts.timezone ?? midMorningTimezone() });
  if (res.status !== 201) throw new Error(`accept failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, user: res.body.data.user as { id: string; name: string; role: string }, email, token };
}

/** Admin assigns, client accepts. */
export async function connect(admin: Client, client: Client, clientId: string, mentorId: string) {
  const a = await admin.post('/admin/assignments', { clientId, mentorId });
  if (a.status !== 201) throw new Error(`assign failed: ${a.status} ${JSON.stringify(a.body)}`);
  const ok = await client.post('/me/mentor/accept');
  if (ok.status !== 200) throw new Error(`accept failed: ${ok.status} ${JSON.stringify(ok.body)}`);
  return a.body.data.id as string;
}
