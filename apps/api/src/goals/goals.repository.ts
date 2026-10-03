import { Injectable } from '@nestjs/common';
import { table } from '../database/sql';
import { GoalStatus, Prisma } from '@prisma/client';
import { Db } from '../database/prisma.service';
import { notFound } from '../common/errors/app-error';

@Injectable()
export class GoalsRepository {
  async findOwned(db: Db, userId: string, id: string) {
    const goal = await db.goal.findFirst({ where: { id, userId } });
    if (!goal) throw notFound('Goal');
    return goal;
  }

  list(db: Db, userId: string, status?: GoalStatus) {
    return db.goal.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: [{ isPrimary: 'desc' }, { status: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { commitments: { where: { archivedAt: null } } } } },
    });
  }

  countActive(db: Db, userId: string) {
    return db.goal.count({ where: { userId, status: 'ACTIVE' } });
  }

  /** Sum of recorded actual values for the commitment that drives numeric goal progress. */
  async progressTotal(db: Db, userId: string, commitmentId: string) {
    const agg = await db.taskOccurrence.aggregate({
      where: { userId, task: { commitmentId }, status: { not: 'SKIPPED' } },
      _sum: { actualValue: true },
    });
    return Number(agg._sum.actualValue ?? 0);
  }

  /** Progress totals for many commitments in a single grouped query. */
  async progressTotals(db: Db, userId: string, commitmentIds: string[]): Promise<Map<string, number>> {
    if (commitmentIds.length === 0) return new Map();
    const rows = await db.$queryRaw<{ commitmentId: string; total: string | null }[]>`
      SELECT t."commitmentId"::text AS "commitmentId", SUM(o."actualValue")::text AS total
      FROM ${table('TaskOccurrence')} o JOIN ${table('Task')} t ON t."id" = o."taskId"
      WHERE o."userId" = ${userId}::uuid AND o."status" <> 'SKIPPED' AND t."commitmentId" IN (${Prisma.join(commitmentIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY t."commitmentId"`;
    return new Map(rows.map((r) => [r.commitmentId, Number(r.total ?? 0)]));
  }

  /** Keep exactly one primary among active goals. */
  async ensurePrimary(db: Db, userId: string) {
    const primary = await db.goal.findFirst({ where: { userId, status: 'ACTIVE', isPrimary: true } });
    if (primary) return;
    await db.goal.updateMany({ where: { userId, isPrimary: true }, data: { isPrimary: false } });
    const next = await db.goal.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (next) await db.goal.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
}
