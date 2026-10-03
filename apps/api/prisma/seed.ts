/**
 * Development seed: 1 admin, 5 mentors and 5 clients with 30 days of realistic history.
 *   npm run db:seed        (idempotent — removes and recreates the seed accounts)
 *
 * History is produced through the real domain services (generation, completion rules, day closing,
 * streak derivation), so the data obeys exactly the same rules as production.
 *
 *   Client   Mentor  Status    Story
 *   Aravind  Priya   ACTIVE    rough patch, then a strong recent run
 *   Sneha    Priya   ACTIVE    steady and on track
 *   Vikram   Rahul   PENDING   decent; Rahul sees nothing until Vikram accepts
 *   Divya    Meera   ACTIVE    struggling for the last few days (needs attention)
 *   Karthik  –       –         unassigned and inactive for 4 days
 *   Arjun and Kavya have no clients yet.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { Prisma, User } from '@prisma/client';
import { loadConfig } from '../src/config/env';
import { PrismaService } from '../src/database/prisma.service';
import { OccurrenceGeneratorService } from '../src/accountability/occurrence-generator.service';
import { AccountabilityService } from '../src/accountability/accountability.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { addDays, dateRange, isoWeekday, localTimeToUtc, startOfWeek, todayIn, toDbDate } from '../src/domain/dates';
import { evaluateCompletion, Unit } from '../src/domain/completion';
import { checkInSchedule } from '../src/domain/checkin';

const PASSWORD = 'Password123';
const TZ = 'Asia/Kolkata';
const DOMAIN = 'accountability.dev';
const email = (name: string) => `${name.toLowerCase()}@${DOMAIN}`;
const MENTORS = ['Priya Sharma', 'Rahul Verma', 'Meera Nair', 'Arjun Rao', 'Kavya Iyer'];
/** What clients see in the mentor directory. */
const PROFILES: Record<string, { headline: string; bio: string; focusAreas: ('CAREER' | 'STUDY' | 'FITNESS' | 'HEALTH' | 'CODING' | 'BUSINESS' | 'PERSONAL')[]; languages: string[] }> = {
  Priya: { headline: 'Career coach · former tech hiring manager', bio: 'I help people land their next role: job-search routines, interview prep and staying consistent when rejections pile up.', focusAreas: ['CAREER', 'CODING'], languages: ['English', 'Hindi'] },
  Rahul: { headline: 'Exam strategist · GATE and GRE', bio: 'Structured study plans, mock-test reviews and beating procrastination before big exams.', focusAreas: ['STUDY', 'CODING'], languages: ['English', 'Hindi'] },
  Meera: { headline: 'Career switch mentor · data and analytics', bio: 'I switched from sales to analytics myself. I help career changers build skills and a portfolio step by step.', focusAreas: ['CAREER', 'STUDY'], languages: ['English', 'Malayalam', 'Tamil'] },
  Arjun: { headline: 'Running and fitness coach', bio: 'From first 5K to half marathon: sustainable training habits, sleep and recovery.', focusAreas: ['FITNESS', 'HEALTH'], languages: ['English', 'Kannada'] },
  Kavya: { headline: 'Habits and wellbeing coach', bio: 'Small daily habits, energy and balance — for anyone who keeps restarting.', focusAreas: ['HEALTH', 'PERSONAL', 'FITNESS'], languages: ['English', 'Tamil', 'Telugu'] },
};

// Deterministic PRNG so every seed run produces the same story.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type CommitmentDef = { key: string; title: string; targetValue: number; targetUnit: Unit; preferredTime: string; weekday: [number, number]; weekend: [number, number] };

const JOB_HUNT: CommitmentDef[] = [
  { key: 'apply', title: 'Apply to 5 jobs', targetValue: 5, targetUnit: 'COUNT', preferredTime: '10:00', weekday: [0.86, 0.1], weekend: [0.6, 0.25] },
  { key: 'dsa', title: 'Solve 2 DSA problems', targetValue: 2, targetUnit: 'COUNT', preferredTime: '08:00', weekday: [0.8, 0.12], weekend: [0.7, 0.15] },
  { key: 'interview', title: 'Interview preparation', targetValue: 30, targetUnit: 'MINUTES', preferredTime: '19:00', weekday: [0.5, 0.3], weekend: [0.4, 0.3] },
  { key: 'english', title: 'English practice', targetValue: 15, targetUnit: 'MINUTES', preferredTime: '07:30', weekday: [0.72, 0.15], weekend: [0.55, 0.2] },
];
const FITNESS: CommitmentDef[] = [
  { key: 'walk', title: 'Walk 6,000 steps', targetValue: 6000, targetUnit: 'COUNT', preferredTime: '18:30', weekday: [0.85, 0.1], weekend: [0.8, 0.1] },
  { key: 'water', title: 'Drink 2 litres of water', targetValue: 1, targetUnit: 'BOOLEAN', preferredTime: '20:00', weekday: [0.9, 0], weekend: [0.85, 0] },
  { key: 'sleep', title: 'In bed by 23:00', targetValue: 1, targetUnit: 'BOOLEAN', preferredTime: '22:45', weekday: [0.7, 0], weekend: [0.5, 0] },
];
const STUDY: CommitmentDef[] = [
  { key: 'study', title: 'Study for 60 minutes', targetValue: 60, targetUnit: 'MINUTES', preferredTime: '09:00', weekday: [0.75, 0.15], weekend: [0.6, 0.2] },
  { key: 'mock', title: 'One mock test section', targetValue: 1, targetUnit: 'BOOLEAN', preferredTime: '17:00', weekday: [0.6, 0], weekend: [0.6, 0] },
  { key: 'revise', title: 'Revise flashcards', targetValue: 20, targetUnit: 'MINUTES', preferredTime: '21:00', weekday: [0.7, 0.2], weekend: [0.6, 0.2] },
];

interface ClientDef {
  name: string;
  seed: number;
  goal: { title: string; description: string; motivation: string; category: 'CAREER' | 'FITNESS' | 'STUDY' };
  commitments: CommitmentDef[];
  /** Adjust [pFull, pPartial] per day offset (0 = 30 days ago, 29 = yesterday). */
  mood: (offset: number, p: [number, number]) => [number, number];
  skipCheckIn: (offset: number, r: number) => boolean;
  /** Days since last activity (sets lastActiveAt). */
  idleDays?: number;
  /** Stop recording anything after this offset (inactive clients). */
  lastActiveOffset?: number;
}

const CLIENTS: ClientDef[] = [
  {
    name: 'Aravind Kumar',
    seed: 42,
    goal: { title: 'Get a software engineering job', description: 'Land a backend or full-stack role at a product company.', motivation: 'Work that challenges me and a stable income for my family.', category: 'CAREER' },
    commitments: JOB_HUNT,
    mood: (o, [f, p]) => (o >= 11 && o <= 13 ? [f * 0.35, p] : o >= 19 ? [Math.min(0.97, f + 0.25), p * 0.5] : [f, p]),
    skipCheckIn: (o, r) => (o >= 11 && o <= 13 ? r < 0.67 : o < 19 && r < 0.1),
  },
  {
    name: 'Sneha Reddy',
    seed: 7,
    goal: { title: 'Get fit before my sister’s wedding', description: 'Lose 5 kg and build a daily walking habit.', motivation: 'I want to feel strong and confident.', category: 'FITNESS' },
    commitments: FITNESS,
    mood: (_o, [f, p]) => [Math.min(0.95, f + 0.1), p],
    skipCheckIn: (_o, r) => r < 0.05,
  },
  {
    name: 'Vikram Singh',
    seed: 99,
    goal: { title: 'Clear the GATE exam', description: 'Score above 600 in GATE CS.', motivation: 'A seat at a top institute for my master’s.', category: 'STUDY' },
    commitments: STUDY,
    mood: (_o, p) => p,
    skipCheckIn: (_o, r) => r < 0.15,
  },
  {
    name: 'Divya Menon',
    seed: 1234,
    goal: { title: 'Switch to a data analyst role', description: 'Build a portfolio and apply for analyst jobs.', motivation: 'I enjoy working with numbers more than sales.', category: 'CAREER' },
    commitments: JOB_HUNT.slice(0, 3),
    mood: (o, [f, p]) => (o >= 25 ? [0.15, 0.2] : [f, p]),
    skipCheckIn: (o, r) => (o >= 28 ? true : o >= 25 ? r < 0.5 : r < 0.1),
  },
  {
    name: 'Karthik Raj',
    seed: 555,
    goal: { title: 'Run a 10 km race', description: 'Finish the city 10K in under an hour.', motivation: 'Prove to myself I can stick with something.', category: 'FITNESS' },
    commitments: FITNESS.slice(0, 2),
    mood: (_o, p) => p,
    skipCheckIn: (_o, r) => r < 0.2,
    idleDays: 4,
    lastActiveOffset: 25,
  },
];

const REFLECTIONS = [
  'Got through the hardest task early, which made the evening calmer.',
  'Finally clicking — the practice is paying off.',
  'Felt more structured today.',
  'Work ran late, but I protected the morning routine.',
  'Felt tired; did the minimum and that is fine.',
];
const BLOCKERS = ['TOO_BUSY', 'LOW_ENERGY', 'UNEXPECTED_WORK', 'POOR_PLANNING', 'TOO_DIFFICULT', 'FORGOT'];

async function main() {
  const config = loadConfig();
  const prisma = new PrismaService(config);
  await prisma.$connect();
  const notifications = new NotificationsService(prisma, new JobQueueService(prisma), { ...config, push: null });
  const generator = new OccurrenceGeneratorService();
  const accountability = new AccountabilityService(prisma, generator, notifications);

  const seedEmails = ['admin', 'coach', 'demo', ...MENTORS.map((m) => m.split(' ')[0]), ...CLIENTS.map((c) => c.name.split(' ')[0])].map(email);
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });
  await prisma.mentorInvite.deleteMany({ where: { email: { in: seedEmails } } });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();
  const today = todayIn(TZ, now);
  const start = addDays(today, -30);
  const base = { passwordHash, timezone: TZ, onboardedAt: now, notificationPreference: { create: {} }, streak: { create: {} } };

  const admin = await prisma.user.create({ data: { ...base, name: 'Ada Admin', email: email('admin'), role: 'ADMIN', lastActiveAt: now, subscription: { create: { plan: 'COACH' } } } });
  const mentors: Record<string, User> = {};
  for (const name of MENTORS) {
    const first = name.split(' ')[0];
    mentors[first] = await prisma.user.create({
      data: { ...base, name, email: email(first), role: 'MENTOR', lastActiveAt: now, subscription: { create: { plan: 'COACH' } }, mentorProfile: { create: PROFILES[first] } },
    });
  }

  const clients: Record<string, User> = {};
  for (const def of CLIENTS) {
    const first = def.name.split(' ')[0];
    const rand = rng(def.seed);
    const user = await prisma.user.create({
      data: {
        ...base,
        name: def.name,
        email: email(first),
        role: 'USER',
        checkInTime: '21:00',
        restDays: [7],
        createdAt: localTimeToUtc(addDays(start, -1), '19:30', TZ),
        lastActiveAt: new Date(now.getTime() - (def.idleDays ?? 0) * 86_400_000 - 3_600_000),
        phone: first === 'Aravind' ? '+919876543210' : null,
        mentorWhatsappOptIn: first === 'Aravind',
        subscription: { create: { plan: 'FREE' } },
      },
    });
    clients[first] = user;
    const goal = await prisma.goal.create({
      data: { userId: user.id, ...def.goal, successMeasure: 'Goal reached', status: 'ACTIVE', isPrimary: true, startDate: toDbDate(start), targetDate: toDbDate(addDays(today, 60)) },
    });
    const taskByKey: Record<string, string> = {};
    for (const [i, d] of def.commitments.entries()) {
      const c = await prisma.commitment.create({
        data: {
          goalId: goal.id, title: d.title, frequency: 'DAILY', recurrence: { type: 'DAILY' } as Prisma.InputJsonValue, targetValue: d.targetValue, targetUnit: d.targetUnit,
          startDate: toDbDate(start), preferredTime: d.preferredTime, timezone: TZ, sortOrder: i, tasks: { create: { title: d.title } },
        },
        include: { tasks: true },
      });
      taskByKey[d.key] = c.tasks[0].id;
    }

    const acc = await accountability.loadUser(prisma, user.id);
    for (const date of dateRange(start, addDays(today, -1))) {
      const offset = dateRange(start, date).length - 1;
      const weekend = isoWeekday(date) >= 6;
      await generator.generateForDate(prisma, acc, date);
      const inactive = def.lastActiveOffset !== undefined && offset > def.lastActiveOffset;
      const occs = await prisma.taskOccurrence.findMany({ where: { userId: user.id, scheduledDate: toDbDate(date) } });
      for (const o of occs) {
        if (inactive) continue;
        const cdef = def.commitments.find((d) => taskByKey[d.key] === o.taskId)!;
        const [pFull, pPartial] = def.mood(offset, weekend ? cdef.weekend : cdef.weekday);
        const r = rand();
        const target = Number(o.targetValue);
        let actual = 0;
        if (r < pFull) actual = target;
        else if (r < pFull + pPartial) actual = Math.max(1, Math.round(target * (0.35 + rand() * 0.5)));
        if (actual === 0) continue;
        const { status, completionPercentage } = evaluateCompletion(actual, target, o.targetUnit as Unit);
        const completedAt = new Date(o.scheduledStartTime.getTime() + (20 + Math.floor(rand() * 180)) * 60_000);
        await prisma.taskOccurrence.update({
          where: { id: o.id },
          data: {
            status, actualValue: actual, completionPercentage, completedAt,
            completionDelayMinutes: Math.round((completedAt.getTime() - o.scheduledStartTime.getTime()) / 60_000),
            completions: { create: { status, actualValue: actual, completionPercentage, completedAt, source: 'TASK' } },
          },
        });
        if (cdef.key === 'dsa' && status === 'COMPLETED' && rand() < 0.4) {
          await prisma.evidence.create({ data: { userId: user.id, taskOccurrenceId: o.id, type: 'URL', url: 'https://leetcode.com/problemset/', description: 'Solved two array problems (two pointers).', submittedAt: completedAt } });
        }
      }
      const isRest = acc.restDays.includes(isoWeekday(date));
      if (!isRest && !inactive && !def.skipCheckIn(offset, rand())) {
        const done = await prisma.taskOccurrence.findMany({ where: { userId: user.id, scheduledDate: toDbDate(date) }, select: { completionPercentage: true } });
        const pct = done.length ? Math.round(done.reduce((s, x) => s + x.completionPercentage, 0) / done.length) : 0;
        const schedule = checkInSchedule(date, '21:00', TZ);
        const late = rand() < 0.12;
        await prisma.checkIn.create({
          data: {
            userId: user.id, date: toDbDate(date), scheduledAt: schedule.scheduledAt,
            startedAt: new Date(schedule.scheduledAt.getTime() + (late ? 75 : 10) * 60_000),
            completedAt: new Date(schedule.scheduledAt.getTime() + (late ? 80 : 14) * 60_000),
            status: late ? 'LATE' : 'COMPLETED',
            completionPercentage: pct,
            blockers: pct < 100 ? [BLOCKERS[Math.floor(rand() * BLOCKERS.length)]] : [],
            blocker: pct < 60 ? 'Work ran late.' : null,
            confidence: pct >= 80 ? 4 + Math.round(rand()) : pct < 40 ? 2 : 3,
            mood: 3 + Math.round(rand() * 2),
            reflection: rand() < 0.55 ? REFLECTIONS[Math.floor(rand() * REFLECTIONS.length)] : null,
            reflectionPrivate: rand() < 0.1,
          },
        });
      }
      await accountability.closeDay(prisma, acc, date, now);
    }
    // Today: a couple of things already done (except for the inactive client).
    await generator.generateForDate(prisma, acc, today);
    await accountability.ensureCheckIn(prisma, acc, today);
    if (def.lastActiveOffset === undefined) {
      const todays = await prisma.taskOccurrence.findMany({ where: { userId: user.id, scheduledDate: toDbDate(today) }, orderBy: { scheduledStartTime: 'asc' }, take: 2 });
      for (const o of todays) {
        const done = new Date(Math.min(now.getTime(), o.scheduledStartTime.getTime() + 40 * 60_000));
        if (done < o.scheduledStartTime) continue;
        const target = Number(o.targetValue);
        await prisma.taskOccurrence.update({
          where: { id: o.id },
          data: { status: 'COMPLETED', actualValue: target, completionPercentage: 100, completedAt: done, completions: { create: { status: 'COMPLETED', actualValue: target, completionPercentage: 100, completedAt: done } } },
        });
      }
    }
    await accountability.recomputeDay(prisma, acc, today);
    await accountability.recomputeStreak(prisma, acc, today);
    await prisma.notification.updateMany({ where: { userId: user.id }, data: { readAt: now } });
  }

  // ── Assignments (as in the design doc) ──────────────────────────────
  const assign = (client: string, mentor: string, active: boolean, daysAgo: number) =>
    prisma.mentorAssignment.create({
      data: {
        clientId: clients[client].id, mentorId: mentors[mentor].id, assignedById: admin.id,
        status: active ? 'ACTIVE' : 'PENDING',
        createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
        acceptedAt: active ? new Date(now.getTime() - (daysAgo - 1) * 86_400_000) : null,
      },
    });
  const aAravind = await assign('Aravind', 'Priya', true, 21);
  await assign('Sneha', 'Priya', true, 14);
  await assign('Vikram', 'Rahul', false, 1);
  const aDivya = await assign('Divya', 'Meera', true, 20);
  await prisma.notification.create({
    data: { userId: clients.Vikram.id, type: 'ASSIGNMENT', dedupeKey: 'seed-assignment', title: 'Rahul Verma would like to be your mentor', body: 'Accept to share your progress, check-ins, reflections and evidence. Nothing is shared until you accept.', scheduledAt: now, status: 'SENT', sentAt: now, link: '/app/dashboard' },
  });

  // ── Toolkit demo: Priya ↔ Aravind ───────────────────────────────────
  const priya = mentors.Priya;
  const at = (daysFromNow: number, hhmm: string) => localTimeToUtc(addDays(today, daysFromNow), hhmm, TZ);
  const past = await prisma.mentorSession.create({
    data: { mentorId: priya.id, clientId: clients.Aravind.id, assignmentId: aAravind.id, startsAt: at(-7, '19:00'), durationMin: 30, channel: 'WHATSAPP', status: 'DONE', agenda: [{ id: 'a1', text: 'Celebrate the comeback after the rough patch', done: true }, { id: 'a2', text: 'Agree a fixed slot for interview prep', done: true }] },
  });
  const note = await prisma.mentorNote.create({
    data: {
      clientId: clients.Aravind.id, authorId: priya.id, sessionId: past.id, kind: 'SESSION',
      sections: { howTheyAreDoing: 'Much better than two weeks ago. Energy is up.', wins: 'Back on track with applications; DSA streak.', challenges: 'Interview prep keeps slipping to late evening.', agreed: 'Interview prep moves to 18:00, before dinner.', nextSession: 'Next week, same time.' },
      text: 'How they’re doing: Much better than two weeks ago. Energy is up.\nWins: Back on track with applications; DSA streak.\nChallenges: Interview prep keeps slipping to late evening.\nWhat we agreed: Interview prep moves to 18:00, before dinner.\nNext session: Next week, same time.',
      tags: ['motivation', 'skills'], sharedSummary: 'Great progress this week! We agreed to move interview prep to 18:00. Let’s check in next week.', sharedAt: at(-7, '19:40'),
      createdAt: at(-7, '19:35'),
    },
  });
  await prisma.mentorNote.create({ data: { clientId: clients.Aravind.id, authorId: priya.id, kind: 'QUICK', text: 'Prefers WhatsApp calls after 7 pm.', tags: ['personal'], pinned: true, createdAt: at(-20, '12:00') } });
  await prisma.actionItem.createMany({
    data: [
      { clientId: clients.Aravind.id, mentorId: priya.id, owner: 'CLIENT', title: 'Do interview prep at 18:00 on weekdays', dueDate: toDbDate(addDays(today, -1)), noteId: note.id },
      { clientId: clients.Aravind.id, mentorId: priya.id, owner: 'CLIENT', title: 'Ask two friends for a mock interview', dueDate: toDbDate(addDays(today, 3)), noteId: note.id },
      { clientId: clients.Aravind.id, mentorId: priya.id, owner: 'MENTOR', title: 'Share a list of system-design resources', dueDate: toDbDate(today), noteId: note.id },
    ],
  });
  await prisma.mentorSession.create({
    data: { mentorId: priya.id, clientId: clients.Aravind.id, assignmentId: aAravind.id, startsAt: at(0, '19:00') > now ? at(0, '19:00') : at(1, '19:00'), durationMin: 30, channel: 'WHATSAPP' },
  });
  await prisma.nudge.create({ data: { mentorId: priya.id, clientId: clients.Aravind.id, template: 'GREAT_STREAK', body: 'Great work, Aravind! You’re on a strong streak. Keep going.', sentAt: at(-3, '09:00'), respondedAt: at(-3, '10:10') } });
  await prisma.nudgeRule.create({ data: { mentorId: priya.id, clientId: clients.Aravind.id, condition: 'NO_CHECKIN_BY', params: { time: '21:30' }, message: 'Hi Aravind, it’s 21:30 — two minutes for today’s check-in?' } });
  await prisma.mentorNote.create({ data: { clientId: clients.Divya.id, authorId: mentors.Meera.id, kind: 'QUICK', text: 'Started a new part-time job; evenings are hard.', tags: ['personal'], createdAt: at(-5, '11:00') } });
  await prisma.mentorSession.create({ data: { mentorId: mentors.Meera.id, clientId: clients.Divya.id, assignmentId: aDivya.id, startsAt: at(1, '18:30'), durationMin: 45, channel: 'VIDEO', link: 'https://meet.google.com/abc-defg-hij' } });

  const lastWeek = startOfWeek(addDays(today, -7));
  console.log('\nSeed complete (password for every account: %s)', PASSWORD);
  console.log('  ADMIN   %s', admin.email);
  for (const m of Object.values(mentors)) console.log('  MENTOR  %s', m.email);
  for (const c of Object.values(clients)) console.log('  CLIENT  %s', c.email);
  console.log('  Weekly reports are generated on first view (week of %s).\n', lastWeek);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
