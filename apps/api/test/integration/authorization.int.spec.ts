import { INestApplication } from '@nestjs/common';
import { createApp, PNG_1PX, registerUser, resetDb, threeCommitments } from './helpers';

/** User A must never reach User B's data by changing an ID (spec §36). */
describe('Ownership & authorization (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
    await resetDb(app);
  });
  afterAll(async () => app.close());

  it('isolates goals, commitments, tasks, check-ins, evidence and analytics between users', async () => {
    const a = await registerUser(app, { name: 'Alice' });
    const b = await registerUser(app, { name: 'Bob' });

    const goal = (await a.client.post('/goals', { title: 'A goal', category: 'CAREER', commitments: [threeCommitments[0]] })).body.data.goal;
    const commitmentId = goal.commitments[0].id;
    const occ = (await a.client.get('/tasks/today')).body.data.items[0];
    const ev = await a.client.uploadEvidence(occ.id, PNG_1PX, 'image/png');
    expect(ev.status).toBe(201);
    const evidenceId = ev.body.data.id;

    const attempts = [
      b.client.get(`/goals/${goal.id}`),
      b.client.patch(`/goals/${goal.id}`, { title: 'hijack' }),
      b.client.delete(`/goals/${goal.id}`),
      b.client.post(`/goals/${goal.id}/pause`),
      b.client.post(`/goals/${goal.id}/complete`, { confirm: true }),
      b.client.get(`/goals/${goal.id}/commitments`),
      b.client.post(`/goals/${goal.id}/commitments`, threeCommitments[1]),
      b.client.patch(`/commitments/${commitmentId}`, { targetValue: 1 }),
      b.client.post(`/commitments/${commitmentId}/pause`),
      b.client.delete(`/commitments/${commitmentId}`),
      b.client.get(`/task-occurrences/${occ.id}`),
      b.client.post(`/task-occurrences/${occ.id}/complete`),
      b.client.post(`/task-occurrences/${occ.id}/miss`),
      b.client.patch(`/task-occurrences/${occ.id}`, { actualValue: 1 }),
      b.client.get(`/task-occurrences/${occ.id}/evidence`),
      b.client.delete(`/evidence/${evidenceId}`),
      b.client.post('/evidence', { taskOccurrenceId: occ.id, type: 'TEXT', description: 'fake' }),
      b.client.post('/evidence/uploads', { taskOccurrenceId: occ.id, contentType: 'image/png', size: 100 }),
      b.client.get(`/analytics/goal/${goal.id}`),
    ];
    for (const res of await Promise.all(attempts)) {
      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    }

    // Bob cannot smuggle Alice's task into his check-in.
    const ci = await b.client.post('/checkins', { items: [{ occurrenceId: occ.id, status: 'COMPLETED' }], confidence: 3 });
    expect(ci.status).toBe(404);

    // Bob's own views contain none of Alice's data.
    expect((await b.client.get('/goals')).body.data).toEqual([]);
    expect((await b.client.get('/tasks/today')).body.data.items).toEqual([]);
    expect((await b.client.get('/dashboard')).body.data.goal).toBeNull();

    // Alice's data is intact.
    const after = await a.client.get(`/goals/${goal.id}`);
    expect(after.body.data.title).toBe('A goal');
    expect((await a.client.get(`/task-occurrences/${occ.id}`)).body.data.status).toBe('PENDING');
    expect((await a.client.get(`/task-occurrences/${occ.id}/evidence`)).body.data).toHaveLength(1);
  });

  it('rejects malformed IDs before touching the database', async () => {
    const a = await registerUser(app);
    const res = await a.client.get('/goals/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('requires authentication on every user endpoint', async () => {
    const { Client } = await import('./helpers');
    const anon = new Client(app);
    for (const url of ['/dashboard', '/goals', '/tasks/today', '/checkins/today', '/analytics/week', '/notifications']) {
      const res = await anon.get(url);
      expect(res.status).toBe(401);
    }
  });
});
