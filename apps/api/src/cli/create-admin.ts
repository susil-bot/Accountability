/* eslint-disable no-console -- command-line tool: console output is its interface */
/**
 * Create the first admin (or promote an existing account). There is deliberately no way to become an
 * admin from the website.
 *
 *   npm run create-admin -- --email you@example.com --name "Your Name" [--timezone Asia/Kolkata]
 *
 * The password is read from ADMIN_PASSWORD, or asked for interactively (input hidden).
 * Promoting an existing account signs it out everywhere so the new role applies immediately.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import * as readline from 'node:readline';
import { loadConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { isValidTimezone } from '../domain/dates';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted || s.includes('\n')) out.output.write(muted ? '\n' : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const timezone = arg('timezone') ?? 'Asia/Kolkata';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Pass --email you@example.com');
  if (!isValidTimezone(timezone)) throw new Error(`Unknown timezone "${timezone}"`);

  const prisma = new PrismaService(loadConfig());
  await prisma.$connect();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role === 'ADMIN') {
        console.log(`${email} is already an admin.`);
        return;
      }
      await prisma.$transaction(async (tx) => {
        await tx.mentorAssignment.updateMany({
          where: { OR: [{ mentorId: existing.id }, { clientId: existing.id }], status: { in: ['PENDING', 'ACTIVE'] } },
          data: { status: 'ENDED', endedAt: new Date(), endedById: existing.id, endReason: 'UNASSIGNED' },
        });
        await tx.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', isActive: true, tokenVersion: { increment: 1 }, onboardedAt: existing.onboardedAt ?? new Date() } });
        await tx.auditLog.create({ data: { userId: existing.id, actorId: existing.id, action: 'ROLE_CHANGED', entityType: 'User', entityId: existing.id, metadata: { from: existing.role, to: 'ADMIN', via: 'cli' } } });
      });
      console.log(`Promoted ${email} to admin. They have been signed out everywhere; sign in again.`);
      return;
    }

    if (!name) throw new Error('Pass --name "Your Name" for a new account');
    const password = process.env.ADMIN_PASSWORD ?? (await askHidden('Password (min 8 chars, a letter and a number): '));
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('Password must be at least 8 characters with a letter and a number.');
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        timezone,
        onboardedAt: new Date(),
        notificationPreference: { create: {} },
        subscription: { create: { plan: 'COACH' } },
        streak: { create: {} },
      },
    });
    await prisma.auditLog.create({ data: { userId: user.id, actorId: user.id, action: 'ADMIN_CREATED', entityType: 'User', entityId: user.id, metadata: { via: 'cli' } } });
    console.log(`Admin ${email} created. Sign in at /login.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
