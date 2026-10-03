import { Injectable } from '@nestjs/common';
import { Prisma, User, WeeklyReport } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { badRequest, notFound } from '../common/errors/app-error';
import { addDays, endOfLocalDay, fromDbDate, isoWeekday, LocalDate, startOfLocalDay, startOfWeek, todayIn, toDbDate } from '../domain/dates';
import { blockerLabel } from '../domain/mentoring';
import { MentorAccessService } from './mentor-access.service';
import { asSubject } from './client-insights.service';

export interface ReportMetrics {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  consistency: number | null;
  completionRate: number | null;
  tasksPlanned: number;
  tasksCompleted: number;
  checkIns: number;
  checkInDays: number;
  score: number | null;
  sessionsHeld: number;
  actionsDone: number;
  actionsOpen: number;
  streak: number;
  commitments: { title: string; planned: number; completed: number; completionRate: number }[];
  topBlockers: { label: string; count: number }[];
}

/**
 * Weekly report per mentored client, generated every Monday (client-local) for the week before.
 * The mentor adds a comment and can share it; the client sees shared reports only.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async generate(client: User, weekStart: LocalDate, mentorId: string | null) {
    const week = await this.analytics.week(asSubject(client), weekStart);
    const from = startOfLocalDay(week.weekStart, client.timezone);
    const to = endOfLocalDay(week.weekEnd, client.timezone);
    const [sessionsHeld, actionsDone, actionsOpen, streak] = await Promise.all([
      this.prisma.mentorSession.count({ where: { clientId: client.id, status: 'DONE', startsAt: { gte: from, lt: to } } }),
      this.prisma.actionItem.count({ where: { clientId: client.id, status: 'DONE', doneAt: { gte: from, lt: to } } }),
      this.prisma.actionItem.count({ where: { clientId: client.id, status: 'OPEN' } }),
      this.prisma.streak.findUnique({ where: { userId: client.id } }),
    ]);
    const metrics: ReportMetrics = {
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      consistency: week.activeDays ? Math.round((week.days.filter((d) => d.isSuccessful).length / week.activeDays) * 100) : null,
      completionRate: week.completionRate,
      tasksPlanned: week.tasksPlanned,
      tasksCompleted: week.tasksCompleted,
      checkIns: week.checkIns,
      checkInDays: week.checkInDays,
      score: week.score,
      sessionsHeld,
      actionsDone,
      actionsOpen,
      streak: streak?.currentStreak ?? 0,
      commitments: week.commitments.map((c) => ({ title: c.title, planned: c.planned, completed: c.completed, completionRate: c.completionRate })),
      topBlockers: week.blockers.slice(0, 3).map((b) => ({ label: blockerLabel(b.reason), count: b.count })),
    };
    // Regenerating keeps the mentor's comment and shared state; only the numbers refresh.
    return this.prisma.weeklyReport.upsert({
      where: { clientId_weekStart: { clientId: client.id, weekStart: toDbDate(week.weekStart) } },
      create: { clientId: client.id, mentorId, weekStart: toDbDate(week.weekStart), metrics: metrics as unknown as Prisma.InputJsonValue },
      update: { metrics: metrics as unknown as Prisma.InputJsonValue, mentorId: mentorId ?? undefined },
    });
  }

  /** From client maintenance: on Monday (client-local), the report for last week, once. */
  async ensureLastWeek(clientId: string, now = new Date()) {
    const client = await this.prisma.user.findUnique({ where: { id: clientId } });
    if (!client) return null;
    const today = todayIn(client.timezone, now);
    if (isoWeekday(today) !== 1) return null;
    const assignment = await this.prisma.mentorAssignment.findFirst({ where: { clientId, status: 'ACTIVE' } });
    if (!assignment) return null;
    const lastWeek = startOfWeek(addDays(today, -7));
    const existing = await this.prisma.weeklyReport.findUnique({ where: { clientId_weekStart: { clientId, weekStart: toDbDate(lastWeek) } } });
    if (existing) return existing;
    return this.generate(client, lastWeek, assignment.mentorId);
  }

  async list(actor: AuthUser, clientId: string) {
    const { client, assignment } = await this.access.client(actor, clientId);
    // Make sure the latest completed week exists even if the Monday job hasn't run yet.
    const lastWeek = startOfWeek(addDays(todayIn(client.timezone), -7));
    const has = await this.prisma.weeklyReport.findUnique({ where: { clientId_weekStart: { clientId, weekStart: toDbDate(lastWeek) } } });
    if (!has && client.createdAt < new Date(Date.now() - 86_400_000)) await this.generate(client, lastWeek, assignment?.mentorId ?? null);
    const rows = await this.prisma.weeklyReport.findMany({ where: { clientId }, orderBy: { weekStart: 'desc' }, take: 12 });
    return rows.map((r) => this.present(r));
  }

  async refresh(actor: AuthUser, clientId: string, weekStart: string) {
    const { client, assignment } = await this.access.client(actor, clientId);
    if (weekStart > todayIn(client.timezone)) throw badRequest('FUTURE_WEEK', 'That week hasn’t started yet.');
    return this.present(await this.generate(client, startOfWeek(weekStart), assignment?.mentorId ?? null));
  }

  async update(actor: AuthUser, id: string, input: { mentorComment?: string | null; share?: boolean }) {
    const r = await this.prisma.weeklyReport.findUnique({ where: { id } });
    if (!r) throw notFound('Report');
    await this.access.assignedMentor(actor, r.clientId);
    const sharing = input.share === true && !r.sharedAt;
    const updated = await this.prisma.tx(async (tx) => {
      const u = await tx.weeklyReport.update({
        where: { id },
        data: {
          mentorComment: input.mentorComment === undefined ? r.mentorComment : input.mentorComment?.trim() || null,
          sharedAt: input.share === undefined ? r.sharedAt : input.share ? (r.sharedAt ?? new Date()) : null,
        },
      });
      if (sharing) {
        await this.audit.record({ userId: r.clientId, actorId: actor.id, action: 'REPORT_SHARED', entityType: 'WeeklyReport', entityId: id }, tx);
        await this.notifications.createOnce(tx, {
          userId: r.clientId,
          type: 'WEEKLY_REVIEW',
          dedupeKey: `REPORT_SHARED:${id}`,
          title: `${actor.name} shared your weekly report`,
          body: `Week of ${fromDbDate(r.weekStart)}.`,
          scheduledAt: new Date(),
          link: '/app/dashboard#from-mentor',
        });
      }
      return u;
    });
    return this.present(updated);
  }

  present(r: WeeklyReport) {
    return { id: r.id, clientId: r.clientId, weekStart: fromDbDate(r.weekStart), metrics: r.metrics as unknown as ReportMetrics, mentorComment: r.mentorComment, sharedAt: r.sharedAt, updatedAt: r.updatedAt };
  }
}
