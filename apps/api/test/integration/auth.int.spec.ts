import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client, createApp, registerUser, resetDb } from './helpers';

describe('Auth & platform (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
    await resetDb(app);
  });
  afterAll(async () => app.close());

  it('registers, sets an httpOnly session cookie, and returns the profile', async () => {
    const c = new Client(app);
    const res = await c.post('/auth/register', { name: 'Ana', email: 'Ana@Example.com', password: 'Password123', timezone: 'Asia/Kolkata' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { user: { email: 'ana@example.com', timezone: 'Asia/Kolkata', role: 'USER', plan: 'FREE' } } });
    expect(res.body.data.token).toBeUndefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/acc_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const me = await c.get('/auth/me');
    expect(me.body.data.email).toBe('ana@example.com');
  });

  it('rejects duplicate emails, bad passwords and invalid timezones', async () => {
    const c = new Client(app);
    expect((await c.post('/auth/register', { name: 'X', email: 'ana@example.com', password: 'Password123', timezone: 'UTC' })).body.error.code).toBe('EMAIL_IN_USE');
    const weak = await c.post('/auth/register', { name: 'X', email: 'x@example.com', password: 'short', timezone: 'UTC' });
    expect(weak.status).toBe(400);
    expect(weak.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    const tz = await c.post('/auth/register', { name: 'X', email: 'y@example.com', password: 'Password123', timezone: 'Mars/Base' });
    expect(tz.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in, rejects wrong credentials without revealing which part was wrong, and logs out', async () => {
    const c = new Client(app);
    const bad = await c.post('/auth/login', { email: 'ana@example.com', password: 'WrongPass1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    const unknown = await c.post('/auth/login', { email: 'nobody@example.com', password: 'WrongPass1' });
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await c.post('/auth/login', { email: 'ana@example.com', password: 'Password123' })).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(200);
    await c.post('/auth/logout');
    const after = await c.get('/auth/me');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /auth/session answers null for anonymous visitors and the profile when signed in', async () => {
    const anon = new Client(app);
    const res = await anon.get('/auth/session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    const { client } = await registerUser(app);
    expect((await client.get('/auth/session')).body.data.email).toMatch(/@test\.dev$/);
  });

  it('logout-all revokes every existing session', async () => {
    const { client, email } = await registerUser(app);
    const second = new Client(app);
    await second.post('/auth/login', { email, password: 'Password123' });
    await client.post('/auth/logout-all');
    expect((await second.get('/auth/me')).body.error.code).toBe('SESSION_EXPIRED');
  });

  it('requires the CSRF header for cookie-authenticated mutations', async () => {
    const { client } = await registerUser(app);
    const res = await client.agent.post('/api/v1/goals').send({ title: 'x', category: 'OTHER' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
    const foreign = await client.agent.post('/api/v1/goals').set('x-requested-with', 'accountability-web').set('origin', 'https://evil.example').send({ title: 'x', category: 'OTHER' });
    expect(foreign.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects unknown fields (mass assignment) and never leaks internals', async () => {
    const { client } = await registerUser(app);
    const res = await client.patch('/users/me', { role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|at \w+ \(/i);
    expect((await client.get('/auth/me')).body.data.role).toBe('USER');
  });

  it('GET /health reports app, database and job-queue status', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok', jobs: 'disabled', deadJobs: 0 });
  });

  it('tags every response with a request id (and echoes a valid upstream one)', async () => {
    const minted = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(minted.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(minted.body.error.requestId).toBe(minted.headers['x-request-id']);
    const echoed = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'cf-ray-12345678');
    expect(echoed.headers['x-request-id']).toBe('cf-ray-12345678');
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
