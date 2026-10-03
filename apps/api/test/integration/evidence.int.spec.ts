import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { EvidenceCleanupService } from '../../src/evidence/evidence-cleanup.service';
import { createApp, PNG_1PX, registerUser, resetDb, threeCommitments } from './helpers';

describe('Evidence: direct signed uploads (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
    await resetDb(app);
  });
  afterAll(async () => app.close());

  async function setup() {
    const u = await registerUser(app);
    await u.client.post('/goals', { title: 'Proof', category: 'CODING', commitments: [{ ...threeCommitments[2], evidenceRequired: true }] });
    const occ = (await u.client.get('/tasks/today')).body.data.items[0];
    return { ...u, occ };
  }

  it('uploads straight to storage, verifies the stored bytes, and serves only signed links', async () => {
    const { client, occ } = await setup();
    expect(occ.requiresEvidence).toBe(true);
    const res = await client.uploadEvidence(occ.id, PNG_1PX, 'image/png', { thumbnail: PNG_1PX });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'IMAGE', mimeType: 'image/png', sizeBytes: PNG_1PX.length, verification: 'SELF_REPORTED' });
    expect(res.body.data.storageKey).toBeUndefined();
    const { url, thumbnailUrl } = res.body.data;
    expect(url).toMatch(/^\/api\/v1\/storage\/object\?op=get&key=ev%2F/);
    expect(thumbnailUrl).toMatch(/\.thumb\.png/);

    const file = await request(app.getHttpServer()).get(url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await request(app.getHttpServer()).get(url.replace(/sig=[^&]+/, 'sig=forged'))).status).toBe(403);

    await client.post(`/task-occurrences/${occ.id}/complete`);
    const dash = await client.get('/dashboard');
    expect(dash.body.data.today.score).toBe(Math.round(100 * 0.5 + 0 * 0.2 + 100 * 0.2 + 100 * 0.1));
  });

  it('rejects files whose real bytes do not match the declared type, and deletes them', async () => {
    const { client, occ } = await setup();
    const res = await client.uploadEvidence(occ.id, Buffer.from('<script>alert(1)</script>'), 'image/png');
    expect(res.status).toBe(415);
    expect(res.body.error).toMatchObject({ code: 'INVALID_FILE', message: 'File contents do not match its type.' });
    expect(await app.get(PrismaService).evidence.count({ where: { taskOccurrenceId: occ.id } })).toBe(0);
  });

  it('refuses disallowed types and oversize uploads before any bytes move', async () => {
    const { client, occ } = await setup();
    expect((await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'application/x-msdownload', size: 10 })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: 10 * 1024 * 1024 + 1 })).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces the 10 MB limit on the bytes actually sent', async () => {
    const { client, occ } = await setup();
    const ticket = await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: 100 });
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const put = await client.putSigned(ticket.body.data.uploadUrl, big, 'image/png');
    expect(put.status).toBe(413);
  });

  it('upload links are single-use, signed and scoped to their key', async () => {
    const { client, occ } = await setup();
    const ticket = (await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: PNG_1PX.length })).body.data;
    expect((await client.putSigned(ticket.uploadUrl.replace(/sig=[^&]+/, 'sig=nope'), PNG_1PX, 'image/png')).status).toBe(403);
    expect((await client.putSigned(ticket.uploadUrl, PNG_1PX, 'image/png')).status).toBe(200);
    expect((await client.putSigned(ticket.uploadUrl, PNG_1PX, 'image/png')).status).toBe(409);
    const confirm = { taskOccurrenceId: occ.id, type: 'IMAGE', uploadKey: ticket.key };
    expect((await client.post('/evidence', confirm)).status).toBe(201);
    expect((await client.post('/evidence', confirm)).status).toBe(404);
  });

  it("another user can't confirm my upload", async () => {
    const a = await setup();
    const b = await setup();
    const ticket = (await a.client.post('/evidence/uploads', { taskOccurrenceId: a.occ.id, contentType: 'image/png', size: PNG_1PX.length })).body.data;
    await a.client.putSigned(ticket.uploadUrl, PNG_1PX, 'image/png');
    const res = await b.client.post('/evidence', { taskOccurrenceId: b.occ.id, type: 'IMAGE', uploadKey: ticket.key });
    expect(res.status).toBe(404);
  });

  it('caps evidence per task', async () => {
    const { client, occ } = await setup();
    for (let i = 0; i < 5; i++) expect((await client.post('/evidence', { taskOccurrenceId: occ.id, type: 'TEXT', description: `note ${i}` })).status).toBe(201);
    expect((await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: 10 })).body.error.code).toBe('EVIDENCE_LIMIT');
  });

  it('supports URL and TEXT evidence and soft-deletes', async () => {
    const { client, occ } = await setup();
    const link = await client.post('/evidence', { taskOccurrenceId: occ.id, type: 'URL', url: 'https://github.com/me/repo/pull/1' });
    expect(link.body.data).toMatchObject({ type: 'URL', url: 'https://github.com/me/repo/pull/1' });
    expect((await client.post('/evidence', { taskOccurrenceId: occ.id, type: 'URL', url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await client.post('/evidence', { taskOccurrenceId: occ.id, type: 'TEXT', description: 'Read chapter 3' })).status).toBe(201);
    await client.delete(`/evidence/${link.body.data.id}`);
    expect((await client.get(`/task-occurrences/${occ.id}/evidence`)).body.data).toHaveLength(1);
  });

  it('cleans up abandoned uploads', async () => {
    const { client, occ } = await setup();
    const ticket = (await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: PNG_1PX.length })).body.data;
    await client.putSigned(ticket.uploadUrl, PNG_1PX, 'image/png');
    const prisma = app.get(PrismaService);
    const res = await app.get(EvidenceCleanupService).removeExpired(new Date(Date.now() + 2 * 60 * 60_000));
    expect(res.removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.evidenceUpload.findUnique({ where: { key: ticket.key } })).toBeNull();
  });
});
