import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { connect, createAdmin, createApp, inviteMentor, registerUser, resetDb, threeCommitments } from './helpers';

/** Self-service: a client picks a mentor from the directory; choosing is consent. */
describe('Mentor directory (integration)', () => {
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
    const careerMentor = await inviteMentor(app, admin.client, { name: 'Priya Career' });
    const fitMentor = await inviteMentor(app, admin.client, { name: 'Arjun Fitness' });
    await careerMentor.client.patch('/mentor/profile', { headline: 'Career coach', focusAreas: ['CAREER'], languages: ['English', 'Tamil'] });
    await fitMentor.client.patch('/mentor/profile', { headline: 'Fitness coach', focusAreas: ['FITNESS'] });
    const client = await registerUser(app, { name: 'Cara Client' });
    await client.client.post('/goals', { title: 'Get a job', category: 'CAREER', commitments: threeCommitments });
    return { admin, careerMentor, fitMentor, client };
  }

  it('lists available mentors with the best match first, and never to mentors or admins', async () => {
    const { admin, careerMentor, client } = await world();
    const list = (await client.client.get('/me/mentors')).body.data;
    const mine = list.filter((m: { name: string }) => ['Priya Career', 'Arjun Fitness'].includes(m.name));
    expect(mine[0]).toMatchObject({ name: 'Priya Career', headline: 'Career coach', matches: ['CAREER'], languages: ['English', 'Tamil'], available: true, spotsLeft: 15 });
    expect(JSON.stringify(list)).not.toContain('@test.dev'); // no mentor emails in the directory
    expect((await careerMentor.client.get('/me/mentors')).status).toBe(403);
    expect((await admin.client.get('/me/mentors')).status).toBe(403);
  });

  it('lists a mentor only once their profile says who they are', async () => {
    const { admin, client } = await world();
    const blank = await inviteMentor(app, admin.client, { name: 'Blank Profile' });
    const names = async () => (await client.client.get('/me/mentors')).body.data.map((m: { name: string }) => m.name);
    expect(await names()).not.toContain('Blank Profile');
    expect((await blank.client.get('/mentor/profile')).body.data.listed).toBe(false);
    await blank.client.patch('/mentor/profile', { bio: 'I help with habits.' });
    expect(await names()).toContain('Blank Profile');
  });

  it('starts sharing immediately when a client chooses a mentor, and tells the mentor', async () => {
    const { careerMentor, client } = await world();
    const res = await client.client.post('/me/mentor/choose', { mentorId: careerMentor.user.id, message: 'Help me prepare for interviews' });
    expect(res.status).toBe(200);
    expect(res.body.data.assignment).toMatchObject({ status: 'ACTIVE', selfSelected: true, mentor: { name: 'Priya Career' } });
    expect((await careerMentor.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(200);
    const n = await prisma.notification.findFirst({ where: { userId: careerMentor.user.id, type: 'ASSIGNMENT' }, orderBy: { createdAt: 'desc' } });
    expect(n).toMatchObject({ title: 'Cara Client chose you as their mentor', body: '“Help me prepare for interviews”' });
    expect((await client.client.post('/me/mentor/choose', { mentorId: careerMentor.user.id })).status).toBe(409);
  });

  it('switching mentors ends the old link at once without bothering the admin', async () => {
    const { admin, careerMentor, fitMentor, client } = await world();
    await client.client.post('/me/mentor/choose', { mentorId: careerMentor.user.id });
    const s = await careerMentor.client.post('/mentor/sessions', { clientId: client.user.id, startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(s.status).toBe(201);
    const sw = await client.client.post('/me/mentor/choose', { mentorId: fitMentor.user.id });
    expect(sw.body.data.assignment.mentor.name).toBe('Arjun Fitness');
    expect((await careerMentor.client.get(`/mentor/clients/${client.user.id}`)).status).toBe(404);
    expect(await prisma.mentorSession.count({ where: { clientId: client.user.id, status: 'SCHEDULED' } })).toBe(0);
    const old = await prisma.notification.findFirst({ where: { userId: careerMentor.user.id, title: { contains: 'no longer' } } });
    expect(old?.body).toBe('They chose a different mentor.');
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'ASSIGNMENT' } })).toBe(0);
  });

  it('choosing the mentor an admin proposed accepts that request', async () => {
    const { admin, careerMentor, client } = await world();
    const proposed = await admin.client.post('/admin/assignments', { clientId: client.user.id, mentorId: careerMentor.user.id });
    const res = await client.client.post('/me/mentor/choose', { mentorId: careerMentor.user.id });
    expect(res.body.data.assignment).toMatchObject({ id: proposed.body.data.id, status: 'ACTIVE', selfSelected: false });
  });

  it('respects capacity and "not accepting new clients"', async () => {
    const { admin, careerMentor, fitMentor, client } = await world();
    await admin.client.patch(`/admin/mentors/${careerMentor.user.id}/capacity`, { capacity: 1 });
    const other = await registerUser(app);
    await connect(admin.client, other.client, other.user.id, careerMentor.user.id);
    const full = await client.client.post('/me/mentor/choose', { mentorId: careerMentor.user.id });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('MENTOR_AT_CAPACITY');
    expect((await client.client.get('/me/mentors')).body.data.find((m: { id: string }) => m.id === careerMentor.user.id)).toMatchObject({ available: false, spotsLeft: 0 });

    await fitMentor.client.patch('/mentor/profile', { acceptingClients: false });
    expect((await client.client.get('/me/mentors')).body.data.some((m: { id: string }) => m.id === fitMentor.user.id)).toBe(false);
    const closed = await client.client.post('/me/mentor/choose', { mentorId: fitMentor.user.id });
    expect(closed.body.error.code).toBe('MENTOR_NOT_ACCEPTING');
  });

  it('never hands out more spots than a mentor has, even when clients choose at the same moment', async () => {
    const { admin, careerMentor } = await world();
    await admin.client.patch(`/admin/mentors/${careerMentor.user.id}/capacity`, { capacity: 1 });
    const [a, b] = await Promise.all([registerUser(app), registerUser(app)]);
    const results = await Promise.all([a, b].map((c) => c.client.post('/me/mentor/choose', { mentorId: careerMentor.user.id })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.mentorAssignment.count({ where: { mentorId: careerMentor.user.id, status: 'ACTIVE' } })).toBe(1);
  });

  it('rejects unknown, inactive or non-mentor ids', async () => {
    const { admin, client } = await world();
    expect((await client.client.post('/me/mentor/choose', { mentorId: admin.user.id })).status).toBe(404);
    expect((await client.client.post('/me/mentor/choose', { mentorId: client.user.id })).status).toBe(404);
    expect((await client.client.post('/me/mentor/choose', { mentorId: 'not-a-uuid' })).status).toBe(400);
  });
});
