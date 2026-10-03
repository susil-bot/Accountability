import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { fromDbDate } from '../domain/dates';
import { ReportMetrics } from './reports.service';

/**
 * "From your mentor" on the client's Today page. Only content explicitly shared with the client is returned:
 * shared summaries (never the private note), shared weekly reports and the messages they were sent.
 */
@Injectable()
export class ClientUpdatesService {
  constructor(private readonly prisma: PrismaService) {}

  async forClient(user: AuthUser) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [summaries, reports, nudges] = await Promise.all([
      this.prisma.mentorNote.findMany({
        where: { clientId: user.id, sharedAt: { not: null, gte: since }, sharedSummary: { not: null }, archivedAt: null, isDraft: false },
        orderBy: { sharedAt: 'desc' },
        take: 10,
        select: { id: true, authorId: true, sharedSummary: true, sharedAt: true },
      }),
      this.prisma.weeklyReport.findMany({ where: { clientId: user.id, sharedAt: { not: null } }, orderBy: { weekStart: 'desc' }, take: 4 }),
      this.prisma.nudge.findMany({ where: { clientId: user.id, sentAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }, orderBy: { sentAt: 'desc' }, take: 10 }),
    ]);
    const ids = [...new Set([...summaries.map((s) => s.authorId), ...nudges.map((n) => n.mentorId).filter((x): x is string => !!x)])];
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      summaries: summaries.map((s) => ({ id: s.id, from: names.get(s.authorId) ?? 'Your mentor', text: s.sharedSummary!, sharedAt: s.sharedAt! })),
      reports: reports.map((r) => ({ id: r.id, weekStart: fromDbDate(r.weekStart), metrics: r.metrics as unknown as ReportMetrics, mentorComment: r.mentorComment, sharedAt: r.sharedAt! })),
      messages: nudges.map((n) => ({ id: n.id, from: names.get(n.mentorId ?? '') ?? 'Your mentor', body: n.body, sentAt: n.sentAt })),
    };
  }
}
