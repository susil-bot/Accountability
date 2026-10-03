import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { notFound } from '../common/errors/app-error';
import { addDays, diffInDays, fromDbDate, LocalDate, todayIn, toDbDate } from '../domain/dates';
import { blockerLabel, talkingPoints } from '../domain/mentoring';
import { MentorAccessService } from './mentor-access.service';
import { presentAction } from './actions.service';
import { presentSession } from './sessions.service';

const DEFAULT_PERIOD_DAYS = 14;

function avg(xs: number[]) {
  return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
}

/**
 * The prep sheet: everything since the last session that a mentor needs to plan the next call,
 * plus rule-based talking points (domain/mentoring.ts). Read-only; the agenda is saved on the session.
 */
@Injectable()
export class PrepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
  ) {}

  async prep(actor: AuthUser, input: { clientId?: string; sessionId?: string }, now = new Date()) {
    let clientId = input.clientId;
    let session = null as Awaited<ReturnType<typeof this.prisma.mentorSession.findUnique>>;
    if (input.sessionId) {
      session = await this.prisma.mentorSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw notFound('Session');
      clientId = session.clientId;
    }
    if (!clientId) throw notFound('Client');
    const { client } = await this.access.client(actor, clientId);
    // Opened from a client: attach their next call (next 7 days) so the agenda can be saved with it.
    if (!session) {
      session = await this.prisma.mentorSession.findFirst({
        where: { clientId, status: 'SCHEDULED', startsAt: { gte: new Date(now.getTime() - 60 * 60_000), lte: new Date(now.getTime() + 7 * 86_400_000) }, ...(actor.role === 'MENTOR' ? { mentorId: actor.id } : {}) },
        orderBy: { startsAt: 'asc' },
      });
    }
    const today = todayIn(client.timezone, now);

    // Period = since the last completed session before this one (or the last 14 days), compared with the same length before it.
    const lastDone = await this.prisma.mentorSession.findFirst({
      where: { clientId, status: 'DONE', startsAt: { lt: session?.startsAt ?? now }, ...(session ? { id: { not: session.id } } : {}) },
      orderBy: { startsAt: 'desc' },
    });
    const periodStart: LocalDate = lastDone ? todayIn(client.timezone, lastDone.startsAt) : addDays(today, -(DEFAULT_PERIOD_DAYS - 1));
    const length = Math.max(1, diffInDays(periodStart, today) + 1);
    const prevStart = addDays(periodStart, -length);

    const [days, checkIns, occ, evidence, actions, streak, mentorNotes] = await Promise.all([
      this.prisma.dailyAccountability.findMany({ where: { userId: clientId, date: { gte: toDbDate(prevStart), lte: toDbDate(today) } } }),
      this.prisma.checkIn.findMany({ where: { userId: clientId, date: { gte: toDbDate(periodStart), lte: toDbDate(today) } }, orderBy: { date: 'asc' } }),
      this.prisma.taskOccurrence.findMany({
        where: { userId: clientId, status: { not: 'SKIPPED' }, scheduledDate: { gte: toDbDate(periodStart), lte: toDbDate(today) }, OR: [{ status: { not: 'PENDING' } }, { scheduledEndTime: { lt: now } }] },
        select: { title: true, status: true, completionPercentage: true, scheduledDate: true, task: { select: { commitmentId: true, commitment: { select: { title: true } } } } },
      }),
      this.prisma.evidence.count({ where: { userId: clientId, deletedAt: null, submittedAt: { gte: new Date(now.getTime() - length * 86_400_000) } } }),
      this.prisma.actionItem.findMany({ where: { clientId, OR: [{ status: 'OPEN' }, { status: 'DONE', doneAt: { gte: lastDone?.startsAt ?? new Date(now.getTime() - length * 86_400_000) } }] }, orderBy: { dueDate: 'asc' } }),
      this.prisma.streak.findUnique({ where: { userId: clientId } }),
      this.prisma.mentorNote.findMany({ where: { clientId, archivedAt: null, isDraft: false }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 5 }),
    ]);

    const active = (from: LocalDate, to: LocalDate) =>
      days.filter((d) => {
        const ds = fromDbDate(d.date);
        return ds >= from && ds <= to && d.plannedCount > 0 && !d.isRestDay && (d.isFinal || ds === today);
      });
    const nowDays = active(periodStart, today);
    const beforeDays = active(prevStart, addDays(periodStart, -1));

    const byCommitment = new Map<string, { title: string; planned: number; pctSum: number; completed: number; missed: string[] }>();
    for (const o of occ) {
      const key = o.task.commitmentId;
      const row = byCommitment.get(key) ?? { title: o.task.commitment.title, planned: 0, pctSum: 0, completed: 0, missed: [] };
      row.planned++;
      row.pctSum += o.completionPercentage;
      if (o.status === 'COMPLETED') row.completed++;
      if (o.status === 'MISSED') row.missed.push(fromDbDate(o.scheduledDate));
      byCommitment.set(key, row);
    }
    const commitments = [...byCommitment.values()].map((r) => ({ title: r.title, planned: r.planned, completed: r.completed, completionRate: r.planned ? Math.round(r.pctSum / r.planned) : null, missedDates: r.missed.sort() }));

    const blockerCounts: Record<string, number> = {};
    for (const c of checkIns) for (const b of c.blockers) blockerCounts[b] = (blockerCounts[b] ?? 0) + 1;
    const blockers = Object.entries(blockerCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, label: blockerLabel(reason), count }));
    const confidences = checkIns.filter((c) => c.confidence !== null);
    const completedCheckIns = checkIns.filter((c) => c.status === 'COMPLETED' || c.status === 'LATE');
    const missedCheckIns = checkIns.filter((c) => c.status === 'MISSED');
    const openActions = actions.filter((a) => a.status === 'OPEN');

    const facts = {
      completionNow: avg(nowDays.map((d) => d.completionPercentage)),
      completionBefore: avg(beforeDays.map((d) => d.completionPercentage)),
      checkInsMissed: missedCheckIns.length,
      streak: streak?.currentStreak ?? 0,
      confidenceFirst: confidences[0]?.confidence ?? null,
      confidenceLast: confidences[confidences.length - 1]?.confidence ?? null,
      blockers,
      commitments,
      openActions: openActions.map((a) => ({ title: a.title, owner: a.owner, dueDate: a.dueDate && fromDbDate(a.dueDate) })),
      today,
    };

    return {
      client: { id: client.id, name: client.name, timezone: client.timezone },
      session: session ? presentSession(session) : null,
      period: { from: periodStart, to: today, days: length, since: lastDone ? 'LAST_SESSION' : 'DEFAULT', lastSessionAt: lastDone?.startsAt ?? null },
      numbers: {
        completion: facts.completionNow,
        completionBefore: facts.completionBefore,
        activeDays: nowDays.length,
        successfulDays: nowDays.filter((d) => d.isSuccessful).length,
        checkInsDone: completedCheckIns.length,
        checkInsMissed: missedCheckIns.length,
        streak: facts.streak,
        longestStreak: streak?.longestStreak ?? 0,
        confidence: confidences.map((c) => ({ date: fromDbDate(c.date), value: c.confidence! })),
        mood: checkIns.filter((c) => c.mood !== null).map((c) => ({ date: fromDbDate(c.date), value: c.mood! })),
      },
      wins: [
        ...(facts.streak >= 3 ? [`${facts.streak}-day streak (longest ${streak?.longestStreak ?? facts.streak})`] : []),
        ...commitments.filter((c) => c.planned >= 2 && c.completionRate === 100).map((c) => `${c.title}: done every time (${c.planned}/${c.planned})`),
        ...(evidence > 0 ? [`${evidence} piece${evidence === 1 ? '' : 's'} of evidence submitted`] : []),
        ...actions.filter((a) => a.status === 'DONE').map((a) => `Done: ${a.title}`),
      ],
      struggles: {
        missedByCommitment: commitments.filter((c) => c.missedDates.length > 0).map((c) => ({ title: c.title, missed: c.missedDates.length, dates: c.missedDates })),
        blockers,
        lowConfidenceDays: confidences.filter((c) => (c.confidence ?? 5) <= 2).map((c) => fromDbDate(c.date)),
      },
      reflections: completedCheckIns
        .filter((c) => c.reflection || c.reflectionPrivate)
        .slice(-6)
        .reverse()
        .map((c) => ({ date: fromDbDate(c.date), text: c.reflectionPrivate ? null : c.reflection, private: c.reflectionPrivate })),
      actions: actions.map((a) => presentAction(a, today)),
      recentNotes: mentorNotes.map((n) => ({ id: n.id, kind: n.kind, pinned: n.pinned, text: n.text.slice(0, 300), createdAt: n.createdAt })),
      talkingPoints: talkingPoints(facts),
    };
  }
}
