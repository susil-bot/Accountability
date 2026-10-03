import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { createApp, PNG_1PX, registerUser, resetDb, threeCommitments } from './helpers';

/**
 * STORAGE_DRIVER=s3 (e.g. Supabase Storage): bytes are proxied through the API to an S3-compatible store.
 * A tiny in-memory S3 stands in for the real one and checks every call is SigV4-signed and path-style.
 */
describe('Evidence via the S3 proxy driver (integration)', () => {
  let app: INestApplication;
  let s3: Server;
  const objects = new Map<string, { body: Buffer; type: string }>();
  const calls: string[] = [];
  const saved = { ...process.env };

  beforeAll(async () => {
    s3 = createServer((req, res) => {
      const auth = String(req.headers.authorization ?? '');
      if (!auth.startsWith('AWS4-HMAC-SHA256 Credential=TESTKEY/') || !auth.includes('/ap-south-1/s3/aws4_request')) {
        res.writeHead(403).end('bad signature');
        return;
      }
      const path = decodeURIComponent((req.url ?? '').split('?')[0]);
      calls.push(`${req.method} ${path}`);
      if (!path.startsWith('/storage/v1/s3/evidence/ev/')) return void res.writeHead(400).end('bad path');
      const obj = objects.get(path);
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          objects.set(path, { body: Buffer.concat(chunks), type: String(req.headers['content-type']) });
          res.writeHead(200).end();
        });
        return;
      }
      if (req.method === 'DELETE') return void (objects.delete(path), res.writeHead(204).end());
      if (!obj) return void res.writeHead(404).end();
      if (req.method === 'HEAD') return void res.writeHead(200, { 'Content-Length': obj.body.length }).end();
      const range = /bytes=0-(\d+)/.exec(String(req.headers.range ?? ''));
      const body = range ? obj.body.subarray(0, Number(range[1]) + 1) : obj.body;
      res.writeHead(range ? 206 : 200, { 'Content-Type': obj.type, 'Content-Length': body.length }).end(body);
    });
    await new Promise<void>((r) => s3.listen(0, '127.0.0.1', r));
    Object.assign(process.env, {
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: `http://127.0.0.1:${(s3.address() as AddressInfo).port}/storage/v1/s3`,
      S3_REGION: 'ap-south-1',
      STORAGE_BUCKET: 'evidence',
      STORAGE_ACCESS_KEY: 'TESTKEY',
      STORAGE_SECRET_KEY: 'testsecret',
    });
    app = await createApp();
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
    s3.close();
    process.env = saved;
  });

  it('stores, verifies, serves and deletes photos through the API', async () => {
    const { client } = await registerUser(app);
    await client.post('/goals', { title: 'Proof', category: 'CODING', commitments: [{ ...threeCommitments[2], evidenceRequired: true }] });
    const occ = (await client.get('/tasks/today')).body.data.items[0];

    const res = await client.uploadEvidence(occ.id, PNG_1PX, 'image/png', { thumbnail: PNG_1PX });
    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^\/api\/v1\/storage\/object\?op=get&key=ev%2F/);
    expect([...objects.values()].map((o) => o.type)).toEqual(['image/png', 'image/png']);

    const file = await request(app.getHttpServer()).get(res.body.data.url);
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, PNG_1PX)).toBe(0);
    expect((await request(app.getHttpServer()).get(res.body.data.url.replace(/sig=[^&]+/, 'sig=forged'))).status).toBe(403);

    // A signed upload link works once.
    const ticket = await client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: PNG_1PX.length });
    expect((await client.putSigned(ticket.body.data.uploadUrl, PNG_1PX, 'image/png')).status).toBe(200);
    expect((await client.putSigned(ticket.body.data.uploadUrl, PNG_1PX, 'image/png')).status).toBe(409);

    expect((await client.delete(`/evidence/${res.body.data.id}`)).status).toBe(200);
    expect(calls.filter((c) => c.startsWith('DELETE'))).toHaveLength(2);
  });
});
