import { Injectable } from '@nestjs/common';
import { Db } from '../database/prisma.service';
import { notFound } from '../common/errors/app-error';

/** Persistence for commitments. Every lookup is scoped by owner — IDs alone never grant access. */
@Injectable()
export class CommitmentsRepository {
  async findOwned(db: Db, userId: string, id: string) {
    const c = await db.commitment.findFirst({ where: { id, goal: { userId } }, include: { goal: true, tasks: true } });
    if (!c) throw notFound('Commitment');
    return c;
  }

  listForGoal(db: Db, userId: string, goalId: string, includeArchived = false) {
    return db.commitment.findMany({
      where: { goalId, goal: { userId }, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  countActiveForUser(db: Db, userId: string) {
    return db.commitment.count({ where: { goal: { userId, status: { in: ['ACTIVE', 'DRAFT', 'PAUSED'] } }, archivedAt: null, active: true } });
  }

  /** Today's occurrences the user hasn't touched yet (safe to adjust when settings change). */
  untouchedOccurrences(db: Db, commitmentId: string, date: Date, statuses: ('PENDING' | 'SKIPPED')[] = ['PENDING']) {
    return {
      where: {
        task: { commitmentId },
        scheduledDate: date,
        status: { in: statuses },
        actualValue: null,
      },
    } as const;
  }
}
