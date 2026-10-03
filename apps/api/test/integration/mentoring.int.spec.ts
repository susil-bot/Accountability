import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { table } from '../../src/database/sql';
import { JobRunnerService } from '../../src/jobs/job-runner.service';
import { MentoringJobsService } from '../../src/mentoring/mentoring-jobs.service';
import { NudgesService } from '../../src/mentoring/nudges.service';
import { connect, createAdmin, createApp, inviteMentor, registerUser, resetDb, threeCommitments, timezoneAt } from './helpers';

/**
 * Mentoring: roles, invites, assignments with consent, and the security rules from the design doc.
 * Each `it` builds its own people so tests stay independent.
 */
describe('Mentoring (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await resetDb(app);
  });
  afterAll(async () => app.close());

  async function world() {
    const admin = await createAdmin(app);
    const mentorA = await inviteMentor(app, admin.client, { name: 'Priya Mentor' });
    const mentorB = await inviteMentor(app, admin.client, { name: 'Rahul Mentor' });
    const client = await registerUser(app, { name: 'Aravind Client' });
    await client.client.post('/goals', { title: 'Get a job', category: 'CAREER', commitments: threeCommitments });
    return { admin, mentorA, mentorB, client };
  }

  // ── Roles and accounts ──────────────────────────────────────────────

  it('keeps each role inside its own area', async () => {
    const { admin, mentorA, client } = await world();
    expect((await client.client.get('/mentor/clients')).status).toBe(403);
    expect((await client.client.get('/admin/overview')).status).toBe(403);
    expect((await mentorA.client.get('/admin/overview')).status).toBe(403);
    expect((await mentorA.client.post('/admin/assignments', { clientId: client.user.id, mentorId: mentorA.user.id })).status).toBe(403);
    expect((await mentorA.client.get('/me/mentor')).status).toBe(403);
    expect((await admin.client.get('/admin/overview')).status).toBe(200);
    expect((await mentorA.client.get('/mentor/clients')).status).toBe(200);
    expect((await mentorA.client.get('/auth/me')).body.data.role).toBe('MENTOR');
  });

  it('never creates a mentor or admin from sign-up', async () => {
    const res = await registerUser(app);
    const me = await res.client.get('/auth/me');
    expect(me.body.data.role).toBe('USER');
    const sneaky = await res.client.post('/auth/register', { name: 'X', email: `x${Date.now()}@t.dev`, password: 'Password123', timezone: 'UTC', role: 'ADMIN' });
    expect(sneaky.status).toBe(400);
  });

  it('invite links work once, expire, and cannot be guessed', async () => {
    const admin = await createAdmin(app);
    const email = `once${Date.now()}@test.dev`;
    const inv = await admin.client.post('/admin/mentors/invite', { name: 'Once', email });
    const token = new URL(inv.body.data.inviteUrl).searchParams.get('token')!;
    const anon = (await import('./helpers')).Client;

    const preview = await new anon(app).get(`/auth/invite?token=${token}`);
    expect(preview.body.data).toMatchObject({ name: 'Once', email });
    // Only a hash is stored.
    expect(await prisma.mentorInvite.count({ where: { tokenHash: token } })).toBe(0);

    const first = await new anon(app).post('/auth/accept-invite', { token, password: 'Password123', timezone: 'Asia/Kolkata' });
    expect(first.status).toBe(201);
    const second = await new anon(app).post('/auth/accept-invite', { token, password: 'Password123', timezone: 'Asia/Kolkata' });
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe('INVITE_INVALID');

    const guessed = await new anon(app).post('/auth/accept-invite', { token: 'A'.repeat(43), password: 'Password123', timezone: 'UTC' });
    expect(guessed.status).toBe(404);

    const inv2 = await admin.client.post('/admin/mentors/invite', { name: 'Late', email: `late${Date.now()}@test.dev` });
    const token2 = new URL(inv2.body.data.inviteUrl).searchParams.get('token')!;
    await prisma.mentorInvite.update({ where: { id: inv2.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await new anon(app).post('/auth/accept-invite', { token: token2, password: 'Password123', timezone: 'UTC' })).status).toBe(404);
  });

  // ── Assignment and consent ──────────────────────────────────────────

  it('shows a pending client as a name only, and everything after the client accepts', async () => {
    const { admin, mentorA, client } = await world();
    const a = await admin.client.post('/admin/assignments', { clientId: client.user.id, mentorId: mentorA.user.id });
    expect(a.status).toBe(201);

    const board = (await mentorA.client.get('/mentor/clients')).body.data;
    expect(board.clients).toHaveLength(0);
    expect(board.pending).toEqual([expect.objectContaining({ clientId: client.user.id, name: 'Aravind Client' })]);
    expect((await mentorA.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(404);
    expect((await mentorA.client.get(`/mentor/clients/${client.user.id}/timeline`)).status).toBe(404);

    const mine = (await client.client.get('/me/mentor')).body.data;
    expect(mine.assignment).toMatchObject({ status: 'PENDING', mentor: { name: 'Priya Mentor' } });
    expect((await client.client.post('/me/mentor/accept')).status).toBe(200);

    const after = (await mentorA.client.get('/mentor/clients')).body.data;
    expect(after.clients.map((c: { id: string }) => c.id)).toEqual([client.user.id]);
    const page = await mentorA.client.get(`/mentor/clients/${client.user.id}`);
    expect(page.status).toBe(200);
    expect(page.body.data.goal.goal.title).toBe('Get a job');
    // The mentor never sees contact details unless the client opts in to WhatsApp.
    expect(JSON.stringify(page.body.data)).not.toContain(client.email);
    expect(page.body.data.client.whatsapp).toEqual({ available: false, phone: null });
  });

  it('declining sends the client back to the unassigned list', async () => {
    const { admin, mentorA, client } = await world();
    await admin.client.post('/admin/assignments', { clientId: client.user.id, mentorId: mentorA.user.id });
    expect((await client.client.post('/me/mentor/decline')).status).toBe(200);
    const unassigned = (await admin.client.get('/admin/clients?filter=unassigned')).body.data;
    expect(unassigned.map((c: { id: string }) => c.id)).toContain(client.user.id);
    expect((await mentorA.client.get('/mentor/clients')).body.data.pending).toHaveLength(0);
  });

  it("isolates clients between mentors: mentor B can't open, note, mark or nudge mentor A's client", async () => {
    const { admin, mentorA, mentorB, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const action = await mentorA.client.post(`/mentor/clients/${client.user.id}/actions`, { owner: 'CLIENT', title: 'Apply to 3 jobs' });
    const note = await mentorA.client.post(`/mentor/clients/${client.user.id}/notes`, { text: 'Private observation' });
    const id = client.user.id;

    const attempts = [
      mentorB.client.get(`/mentor/clients/${id}`),
      mentorB.client.get(`/mentor/clients/${id}/timeline`),
      mentorB.client.get(`/mentor/clients/${id}/day/2026-10-01`),
      mentorB.client.get(`/mentor/clients/${id}/notes`),
      mentorB.client.post(`/mentor/clients/${id}/notes`, { text: 'hijack' }),
      mentorB.client.get(`/mentor/notes/${note.body.data.id}`),
      mentorB.client.patch(`/mentor/notes/${note.body.data.id}`, { text: 'hijack' }),
      mentorB.client.put(`/mentor/clients/${id}/reviewed`, { reviewed: true }),
      mentorB.client.post(`/mentor/clients/${id}/nudges`, { template: 'CHECKIN_REMINDER' }),
      mentorB.client.post(`/mentor/clients/${id}/rules`, { condition: 'INACTIVE_DAYS', days: 2, message: 'hi' }),
      mentorB.client.patch(`/mentor/actions/${action.body.data.id}`, { status: 'DONE' }),
      mentorB.client.get(`/mentor/prep?clientId=${id}`),
      mentorB.client.get(`/mentor/clients/${id}/reports`),
      mentorB.client.post('/mentor/sessions', { clientId: id, startsAt: new Date(Date.now() + 86_400_000).toISOString() }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
    expect((await mentorB.client.get('/mentor/clients')).body.data.clients).toHaveLength(0);
  });

  it('ends access on the very next request after reassignment, and the new mentor waits for consent', async () => {
    const { admin, mentorA, mentorB, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    expect((await mentorA.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(200);

    const re = await admin.client.post('/admin/assignments', { clientId: client.user.id, mentorId: mentorB.user.id });
    expect(re.status).toBe(201);
    expect((await mentorA.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(404);
    expect((await mentorB.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(404); // pending
    await client.client.post('/me/mentor/accept');
    expect((await mentorB.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(200);

    const history = (await admin.client.get(`/admin/clients/${client.user.id}/assignments`)).body.data.assignments;
    expect(history.map((h: { status: string; endReason: string | null }) => [h.status, h.endReason])).toEqual([
      ['ACTIVE', null],
      ['ENDED', 'REASSIGNED'],
    ]);
  });

  it('client "stop sharing" removes access immediately and tells the admin', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    expect((await client.client.post('/me/mentor/stop')).status).toBe(200);
    expect((await mentorA.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(404);
    const n = await prisma.notification.findFirst({ where: { userId: admin.user.id, type: 'ASSIGNMENT' }, orderBy: { createdAt: 'desc' } });
    expect(n?.title).toContain('stopped sharing');
  });

  it('refuses a second open mentor for the same client, even under simultaneous requests', async () => {
    const { admin, mentorA, mentorB, client } = await world();
    const [r1, r2] = await Promise.all([
      admin.client.post('/admin/assignments', { clientId: client.user.id, mentorId: mentorA.user.id }),
      admin.client.post('/admin/assignments', { clientId: client.user.id, mentorId: mentorB.user.id }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    // Either the second request reassigns (201 + the first ENDED) or it loses the race (409); never two open links.
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    expect(await prisma.mentorAssignment.count({ where: { clientId: client.user.id, status: { in: ['PENDING', 'ACTIVE'] } } })).toBe(1);
    await expect(
      prisma.$executeRaw`INSERT INTO ${table('MentorAssignment')} ("id","mentorId","clientId","status","assignedById","updatedAt") VALUES (gen_random_uuid(), ${mentorA.user.id}::uuid, ${client.user.id}::uuid, 'PENDING', ${admin.user.id}::uuid, now()), (gen_random_uuid(), ${mentorB.user.id}::uuid, ${client.user.id}::uuid, 'PENDING', ${admin.user.id}::uuid, now())`,
    ).rejects.toThrow();
  });

  it('enforces mentor capacity unless the admin confirms', async () => {
    const { admin, mentorA } = await world();
    await admin.client.patch(`/admin/mentors/${mentorA.user.id}/capacity`, { capacity: 1 });
    const c1 = await registerUser(app);
    const c2 = await registerUser(app);
    expect((await admin.client.post('/admin/assignments', { clientId: c1.user.id, mentorId: mentorA.user.id })).status).toBe(201);
    const full = await admin.client.post('/admin/assignments', { clientId: c2.user.id, mentorId: mentorA.user.id });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('MENTOR_AT_CAPACITY');
    expect((await admin.client.post('/admin/assignments', { clientId: c2.user.id, mentorId: mentorA.user.id, overrideCapacity: true })).status).toBe(201);
  });

  it("gives mentors no way to change a client's goals, tasks or check-ins", async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const occ = (await client.client.get('/tasks/today')).body.data.items[0];
    const goal = (await client.client.get('/goals')).body.data[0];
    const attempts = [
      mentorA.client.post(`/task-occurrences/${occ.id}/complete`),
      mentorA.client.patch(`/task-occurrences/${occ.id}`, { actualValue: 1 }),
      mentorA.client.patch(`/goals/${goal.id}`, { title: 'changed' }),
      mentorA.client.post(`/goals/${goal.id}/pause`),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
    const after = (await client.client.get('/tasks/today')).body.data.items[0];
    expect(after.status).toBe(occ.status);
  });

  it('hides a reflection the client marked private', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const items = (await client.client.get('/tasks/today')).body.data.items.map((o: { id: string }) => ({ occurrenceId: o.id, status: 'COMPLETED' }));
    const ci = await client.client.post('/checkins', { items, confidence: 4, reflection: 'Very personal thought', reflectionPrivate: true });
    expect(ci.status).toBe(201);
    const page = await mentorA.client.get(`/mentor/clients/${client.user.id}`);
    expect(JSON.stringify(page.body.data)).not.toContain('Very personal thought');
    expect(page.body.data.checkIns[0]).toMatchObject({ reflection: null, reflectionPrivate: true });
    const day = await mentorA.client.get(`/mentor/clients/${client.user.id}/day/${ci.body.data.checkIn.date}`);
    expect(JSON.stringify(day.body.data)).not.toContain('Very personal thought');
    const timeline = await mentorA.client.get(`/mentor/clients/${client.user.id}/timeline`);
    expect(JSON.stringify(timeline.body.data)).not.toContain('Very personal thought');
  });

  // ── Notes ───────────────────────────────────────────────────────────

  it('keeps note history, lets only the author edit, and never shows private notes to the client', async () => {
    const { admin, mentorA, mentorB, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const created = await mentorA.client.post(`/mentor/clients/${client.user.id}/notes`, {
      kind: 'SESSION',
      sections: { howTheyAreDoing: 'Tired but trying', agreed: 'Prep at 18:00' },
      tags: ['motivation'],
      sharedSummary: 'Nice work this week — prep moves to 18:00.',
      actions: [{ owner: 'CLIENT', title: 'Prep at 18:00', dueDate: '2030-01-01' }],
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.text).toContain('What we agreed: Prep at 18:00');

    const edited = await mentorA.client.patch(`/mentor/notes/${id}`, { sections: { howTheyAreDoing: 'Much better', agreed: 'Prep at 18:00' }, expectedVersion: 1 });
    expect(edited.body.data.version).toBe(2);
    const stale = await mentorA.client.patch(`/mentor/notes/${id}`, { text: 'x', expectedVersion: 1 });
    expect(stale.status).toBe(409);
    const history = (await mentorA.client.get(`/mentor/notes/${id}/history`)).body.data;
    expect(history.versions).toHaveLength(1);
    expect(history.versions[0].text).toContain('Tired but trying');

    const search = (await mentorA.client.get(`/mentor/clients/${client.user.id}/notes?q=much%20better`)).body.data;
    expect(search.map((n: { id: string }) => n.id)).toEqual([id]);

    // The client sees the summary and the action, never the note itself.
    const updates = (await client.client.get('/me/mentor-updates')).body.data;
    expect(updates.summaries[0].text).toBe('Nice work this week — prep moves to 18:00.');
    const clientView = JSON.stringify([updates, (await client.client.get('/me/actions')).body.data, (await client.client.get('/notifications')).body.data]);
    expect(clientView).not.toContain('Tired but trying');
    expect(clientView).not.toContain('Much better');

    // After reassignment the new mentor reads the history but cannot edit someone else's note.
    await connect(admin.client, client.client, client.user.id, mentorB.user.id);
    expect((await mentorB.client.get(`/mentor/notes/${id}`)).status).toBe(200);
    expect((await mentorB.client.patch(`/mentor/notes/${id}`, { text: 'rewrite' })).status).toBe(403);
    expect((await mentorB.client.put(`/mentor/notes/${id}/archive`, { archived: true })).status).toBe(403);
  });

  // ── Action items ────────────────────────────────────────────────────

  it('lets a client tick only their own client-owned items', async () => {
    const { admin, mentorA, client } = await world();
    const other = await registerUser(app);
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const mine = (await mentorA.client.post(`/mentor/clients/${client.user.id}/actions`, { owner: 'CLIENT', title: 'Send CV' })).body.data;
    const mentors = (await mentorA.client.post(`/mentor/clients/${client.user.id}/actions`, { owner: 'MENTOR', title: 'Find a contact' })).body.data;

    expect((await client.client.patch(`/me/actions/${mine.id}`, { status: 'DONE' })).body.data.status).toBe('DONE');
    expect((await client.client.patch(`/me/actions/${mentors.id}`, { status: 'DONE' })).status).toBe(404);
    expect((await other.client.patch(`/me/actions/${mine.id}`, { status: 'OPEN' })).status).toBe(404);
    expect((await client.client.get('/me/actions')).body.data.map((a: { id: string }) => a.id)).toEqual([mine.id]);
  });

  // ── Nudges and rules ────────────────────────────────────────────────

  it('allows 3 nudges per client per day and refuses the 4th', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    for (let i = 0; i < 3; i++) {
      const r = await mentorA.client.post(`/mentor/clients/${client.user.id}/nudges`, { template: 'CHECKIN_REMINDER' });
      expect(r.status).toBe(201);
      expect(r.body.data.whatsappUrl).toBeNull(); // no opt-in yet
    }
    const fourth = await mentorA.client.post(`/mentor/clients/${client.user.id}/nudges`, { template: 'CUSTOM', body: 'One more' });
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('NUDGE_LIMIT');
    const n = await prisma.notification.count({ where: { userId: client.user.id, type: 'MENTOR_NUDGE' } });
    expect(n).toBe(3);
  });

  it('never nudges during the client’s quiet hours', async () => {
    const admin = await createAdmin(app);
    const mentor = await inviteMentor(app, admin.client);
    const night = await registerUser(app, { timezone: timezoneAt(23) });
    await connect(admin.client, night.client, night.user.id, mentor.user.id);
    const r = await mentor.client.post(`/mentor/clients/${night.user.id}/nudges`, { template: 'CHECKIN_REMINDER' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('QUIET_HOURS');
  });

  it('returns a WhatsApp link only after the client opts in', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    expect((await client.client.put('/me/mentor/whatsapp', { optIn: true })).status).toBe(400); // no phone yet
    expect((await client.client.put('/me/mentor/whatsapp', { optIn: true, phone: '+91 98765 43210' })).status).toBe(200);
    const r = await mentorA.client.post(`/mentor/clients/${client.user.id}/nudges`, { template: 'CUSTOM', body: 'Hi there' });
    expect(r.body.data.whatsappUrl).toBe('https://wa.me/919876543210?text=Hi%20there');
    await client.client.put('/me/mentor/whatsapp', { optIn: false });
    const page = await mentorA.client.get(`/mentor/clients/${client.user.id}`);
    expect(JSON.stringify(page.body.data)).not.toContain('9876543210');
  });

  it('fires a nudge rule at most once per day', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const rule = await mentorA.client.post(`/mentor/clients/${client.user.id}/rules`, { condition: 'NO_CHECKIN_BY', time: '00:01', message: 'Time to check in!' });
    expect(rule.status).toBe(201);
    const nudges = app.get(NudgesService);
    expect((await nudges.evaluateRules(client.user.id)).fired).toBe(1);
    expect((await nudges.evaluateRules(client.user.id)).fired).toBe(0);
    const sent = await prisma.nudge.findMany({ where: { clientId: client.user.id } });
    expect(sent).toEqual([expect.objectContaining({ ruleId: rule.body.data.id, body: 'Time to check in!' })]);
  });

  // ── Sessions and reminders ──────────────────────────────────────────

  it('sends each session reminder once, and never for a moved or cancelled session', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const runner = app.get(JobRunnerService);
    const startsAt = new Date(Date.now() + 60 * 60_000);
    const created = await mentorA.client.post('/mentor/sessions', { clientId: client.user.id, startsAt: startsAt.toISOString(), reminderLeadMin: 5, channel: 'WHATSAPP' });
    expect(created.status).toBe(201);
    const session = created.body.data[0];
    const jobs = await prisma.job.findMany({ where: { name: 'session-reminder', payload: { path: ['sessionId'], equals: session.id } } });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].runAt.getTime()).toBe(startsAt.getTime() - 5 * 60_000);

    const at = new Date(startsAt.getTime() - 5 * 60_000);
    await runner.poll(at);
    await runner.poll(at);
    const reminders = await prisma.notification.findMany({ where: { type: 'SESSION_REMINDER', dedupeKey: { startsWith: `SESSION_REMINDER:${session.id}` } } });
    expect(reminders.map((r) => r.userId).sort()).toEqual([client.user.id, mentorA.user.id].sort());
    expect(reminders.find((r) => r.userId === mentorA.user.id)?.link).toBe(`/mentor/prep?sessionId=${session.id}`);

    // Moved: the old reminder becomes a no-op, the new time gets its own.
    const second = (await mentorA.client.post('/mentor/sessions', { clientId: client.user.id, startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString() })).body.data[0];
    const moved = new Date(Date.now() + 3 * 3_600_000);
    await mentorA.client.patch(`/mentor/sessions/${second.id}`, { startsAt: moved.toISOString() });
    await runner.poll(new Date(Date.now() + 2 * 3_600_000 - 4 * 60_000));
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `SESSION_REMINDER:${second.id}` } } })).toBe(0);

    // Cancelled: nothing is sent.
    await mentorA.client.patch(`/mentor/sessions/${second.id}`, { status: 'CANCELLED' });
    await runner.poll(new Date(moved.getTime() - 4 * 60_000));
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `SESSION_REMINDER:${second.id}` } } })).toBe(0);
    expect((await client.client.get('/me/sessions')).body.data.map((s: { id: string }) => s.id)).toEqual([session.id]);
  });

  it('cancels future sessions, drops their reminders and stops rules when an assignment ends', async () => {
    const { admin, mentorA, client } = await world();
    const assignmentId = await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const s = (await mentorA.client.post('/mentor/sessions', { clientId: client.user.id, startsAt: new Date(Date.now() + 86_400_000).toISOString(), repeatWeeks: 2 })).body.data;
    expect(s).toHaveLength(3);
    await mentorA.client.post(`/mentor/clients/${client.user.id}/rules`, { condition: 'INACTIVE_DAYS', days: 2, message: 'Miss you!' });
    expect((await admin.client.post(`/admin/assignments/${assignmentId}/end`)).status).toBe(200);

    expect(await prisma.mentorSession.count({ where: { assignmentId, status: 'SCHEDULED' } })).toBe(0);
    expect(await prisma.job.count({ where: { name: 'session-reminder', status: 'QUEUED', payload: { path: ['sessionId'], equals: s[0].id } } })).toBe(0);
    expect(await prisma.nudgeRule.count({ where: { clientId: client.user.id, active: true } })).toBe(0);
  });

  // ── Prep, timeline, reports, my day ─────────────────────────────────

  it('builds the prep sheet, timeline, weekly report and My day for an active client', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    await mentorA.client.post(`/mentor/clients/${client.user.id}/actions`, { owner: 'MENTOR', title: 'Send resources', dueDate: '2020-01-01' });

    const prep = (await mentorA.client.get(`/mentor/prep?clientId=${client.user.id}`)).body.data;
    expect(prep.period.since).toBe('DEFAULT');
    expect(prep.talkingPoints.some((p: { kind: string }) => p.kind === 'FOLLOW_UP')).toBe(true);

    const timeline = (await mentorA.client.get(`/mentor/clients/${client.user.id}/timeline`)).body.data;
    expect(timeline.items.map((i: { type: string }) => i.type)).toEqual(expect.arrayContaining(['ASSIGNMENT', 'ACTION']));

    const reports = await mentorA.client.get(`/mentor/clients/${client.user.id}/reports`);
    expect(reports.status).toBe(200);
    const refreshed = await mentorA.client.post(`/mentor/clients/${client.user.id}/reports/refresh`, { weekStart: new Date().toISOString().slice(0, 10) });
    expect(refreshed.status).toBe(200);
    const shared = await mentorA.client.patch(`/mentor/reports/${refreshed.body.data.id}`, { mentorComment: 'Solid week', share: true });
    expect(shared.body.data.sharedAt).toBeTruthy();
    expect((await client.client.get('/me/mentor-updates')).body.data.reports[0].mentorComment).toBe('Solid week');

    const day = (await mentorA.client.get('/mentor/my-day')).body.data;
    expect(day.followUps).toEqual([expect.objectContaining({ title: 'Send resources', overdue: true })]);
    expect(day.notReviewed.map((c: { id: string }) => c.id)).toEqual([client.user.id]);
    await mentorA.client.put(`/mentor/clients/${client.user.id}/reviewed`, { reviewed: true });
    expect((await mentorA.client.get('/mentor/my-day')).body.data.notReviewed).toHaveLength(0);
    expect((await mentorA.client.get('/mentor/clients')).body.data.reviewed).toBe(1);
  });

  it('sends the mentor a morning summary once per day', async () => {
    const admin = await createAdmin(app);
    const mentor = await inviteMentor(app, admin.client, { timezone: timezoneAt(9) });
    const client = await registerUser(app);
    await connect(admin.client, client.client, client.user.id, mentor.user.id);
    const jobs = app.get(MentoringJobsService);
    await jobs.runForUser(mentor.user.id);
    await jobs.runForUser(mentor.user.id);
    expect(await prisma.notification.count({ where: { userId: mentor.user.id, type: 'MENTOR_SUMMARY' } })).toBe(1);
  });

  // ── Admin ───────────────────────────────────────────────────────────

  it('deactivating a mentor signs them out and ends their assignments', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    const res = await admin.client.post(`/admin/users/${mentorA.user.id}/active`, { active: false });
    expect(res.body.data.endedAssignments).toBe(1);
    expect((await mentorA.client.get('/mentor/clients')).status).toBe(401);
    expect((await client.client.get('/me/mentor')).body.data.assignment).toBeNull();
    expect((await admin.client.post(`/admin/users/${admin.user.id}/active`, { active: false })).status).toBe(400);
  });

  it('audits who viewed a client and shows mentor activity', async () => {
    const { admin, mentorA, client } = await world();
    await connect(admin.client, client.client, client.user.id, mentorA.user.id);
    await mentorA.client.get(`/mentor/clients/${client.user.id}`);
    await mentorA.client.get(`/mentor/clients/${client.user.id}`);
    const audit = (await admin.client.get(`/admin/audit?userId=${client.user.id}&action=CLIENT_VIEWED`)).body.data.items;
    expect(audit).toHaveLength(1);
    expect(audit[0].actor.id).toBe(mentorA.user.id);
    const activity = (await admin.client.get(`/admin/mentors/${mentorA.user.id}/activity`)).body.data;
    expect(activity).toMatchObject({ activeClients: 1, sessionsHeld: 0, notesWritten: 0 });
  });
});
