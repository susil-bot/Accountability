import { Injectable } from '@nestjs/common';
import { Goal, GoalStatus } from '@prisma/client';
import { Db, PrismaService } from '../database/prisma.service';
import { AppError, badRequest, conflict } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { AccountabilityService } from '../accountability/accountability.service';
import { OccurrenceGeneratorService } from '../accountability/occurrence-generator.service';
import { CommitmentsService } from '../commitments/commitments.service';
import { presentCommitment } from '../commitments/commitments.presenter';
import { GoalsRepository } from './goals.repository';
import { CompleteGoalDto, CreateGoalDto, UpdateGoalDto } from './goals.dto';
import { presentGoal } from './goals.presenter';
import { startOfWeek, todayIn, toDbDate } from '../domain/dates';
import { planWarnings } from '../domain/plan-validation';
import { PLAN_LIMITS, planLimitsEnabled } from '../common/plan-limits';
import { AuthUser } from '../common/decorators/auth.decorators';
import { checkInSchedule } from '../domain/checkin';

const CLOSED: GoalStatus[] = ['COMPLETED', 'ABANDONED'];

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: GoalsRepository,
    private readonly commitments: CommitmentsService,
    private readonly audit: AuditService,
    private readonly accountability: AccountabilityService,
    private readonly generator: OccurrenceGeneratorService,
  ) {}

  async list(user: AuthUser, status?: GoalStatus) {
    const today = todayIn(user.timezone);
    const goals = await this.repo.list(this.prisma, user.id, status);
    // One grouped query for every goal's numeric progress (was one query per goal).
    const totals = await this.repo.progressTotals(
      this.prisma,
      user.id,
      goals.map((g) => g.progressCommitmentId).filter((id): id is string => !!id),
    );
    return goals.map((g) =>
      presentGoal(g, {
        today,
        commitmentCount: g._count.commitments,
        progressTotal: g.progressCommitmentId ? (totals.get(g.progressCommitmentId) ?? 0) : undefined,
      }),
    );
  }

  async get(user: AuthUser, id: string) {
    return this.detail(this.prisma, user, await this.repo.findOwned(this.prisma, user.id, id));
  }

  private async detail(db: Db, user: AuthUser, g: Goal) {
    const today = todayIn(user.timezone);
    const commitments = await db.commitment.findMany({ where: { goalId: g.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const progressTotal = g.progressCommitmentId ? await this.repo.progressTotal(db, user.id, g.progressCommitmentId) : undefined;
    return {
      ...presentGoal(g, { today, progressTotal, commitmentCount: commitments.filter((c) => !c.archivedAt).length }),
      commitments: commitments.map(presentCommitment),
    };
  }

  private async assertGoalCapacity(db: Db, userId: string) {
    if (!planLimitsEnabled()) return;
    const sub = await db.subscription.findUnique({ where: { userId } });
    const limit = PLAN_LIMITS[sub?.plan ?? 'FREE'].activeGoals;
    if ((await this.repo.countActive(db, userId)) >= limit) {
      throw new AppError(
        'PLAN_LIMIT_REACHED',
        `Your plan allows ${limit} active goal${limit === 1 ? '' : 's'}. Pause or complete your current goal first.`,
        403,
      );
    }
  }

  /** Wizard endpoint: goal + commitments + check-in time, atomically. */
  async create(user: AuthUser, dto: CreateGoalDto) {
    const today = todayIn(user.timezone);
    const activate = dto.activate ?? true;
    const startDate = dto.startDate ?? today;
    if (dto.targetDate && dto.targetDate < startDate) throw badRequest('INVALID_DATES', 'Target date must be after the start date.');
    if (dto.targetValue && !dto.targetUnit) throw badRequest('TARGET_UNIT_REQUIRED', 'Choose a unit for the numeric target.');
    const inputs = dto.commitments ?? [];
    if (dto.progressCommitmentIndex !== undefined && !inputs[dto.progressCommitmentIndex]) {
      throw badRequest('INVALID_PROGRESS_COMMITMENT', 'progressCommitmentIndex does not match a commitment.');
    }
    // Validate every commitment before touching the DB.
    inputs.forEach((c) => CommitmentsService.normalise(c, today));

    const goal = await this.prisma.tx(async (tx) => {
      if (activate) await this.assertGoalCapacity(tx, user.id);
      if (inputs.length > 0) await this.commitments.assertCommitmentCapacity(tx, user.id, inputs.length);
      const hasPrimary = (await tx.goal.count({ where: { userId: user.id, status: 'ACTIVE', isPrimary: true } })) > 0;

      let g = await tx.goal.create({
        data: {
          userId: user.id,
          title: dto.title,
          description: dto.description,
          motivation: dto.motivation,
          successMeasure: dto.successMeasure,
          category: dto.category,
          status: activate ? 'ACTIVE' : 'DRAFT',
          isPrimary: activate && !hasPrimary,
          startDate: toDbDate(startDate),
          targetDate: dto.targetDate ? toDbDate(dto.targetDate) : null,
          targetValue: dto.targetValue,
          targetUnit: dto.targetUnit,
        },
      });
      const created = [];
      for (const [i, input] of inputs.entries()) created.push(await this.commitments.createInTx(tx, user, g.id, input, i));
      if (dto.progressCommitmentIndex !== undefined) {
        g = await tx.goal.update({ where: { id: g.id }, data: { progressCommitmentId: created[dto.progressCommitmentIndex].id } });
      }
      // Onboarding in one transaction: schedule settings + the "onboarded" flag land with the first goal.
      await tx.user.updateMany({ where: { id: user.id, onboardedAt: null }, data: { onboardedAt: new Date() } });
      if (dto.restDays) {
        await tx.user.update({ where: { id: user.id }, data: { restDays: [...new Set(dto.restDays)].sort((a, b) => a - b) } });
      }
      if (dto.checkInTime) {
        await tx.user.update({ where: { id: user.id }, data: { checkInTime: dto.checkInTime } });
        const s = checkInSchedule(today, dto.checkInTime, user.timezone);
        await tx.checkIn.updateMany({ where: { userId: user.id, date: toDbDate(today), status: 'PENDING' }, data: { scheduledAt: s.scheduledAt } });
      }
      await this.audit.record(
        { userId: user.id, action: 'GOAL_CREATED', entityType: 'Goal', entityId: g.id, metadata: { title: g.title, commitments: created.length, status: g.status } },
        tx,
      );
      if (activate) {
        const acc = await this.accountability.loadUser(tx, user.id);
        await this.generator.generateForDate(tx, acc, today);
        await this.accountability.ensureCheckIn(tx, acc, today);
        await this.accountability.refresh(tx, user.id, today);
      }
      return g;
    });

    const warnings = planWarnings(
      inputs.map((c) => ({
        recurrence: CommitmentsService.parseRule(c.recurrence),
        targetValue: c.targetValue,
        targetUnit: c.targetUnit,
      })),
    );
    return { goal: await this.detail(this.prisma, user, goal), warnings };
  }

  async update(user: AuthUser, id: string, dto: UpdateGoalDto) {
    return this.prisma.tx(async (tx) => {
      const g = await this.repo.findOwned(tx, user.id, id);
      if (CLOSED.includes(g.status)) {
        const keys = Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined);
        if (keys.some((k) => k !== 'notes')) {
          throw conflict('GOAL_READ_ONLY', 'This goal is closed. Only notes can be edited.');
        }
      }
      if (dto.progressCommitmentId) {
        const c = await tx.commitment.findFirst({ where: { id: dto.progressCommitmentId, goalId: id } });
        if (!c) throw badRequest('INVALID_PROGRESS_COMMITMENT', 'That commitment does not belong to this goal.');
      }
      if (dto.isPrimary) {
        if (g.status !== 'ACTIVE') throw conflict('GOAL_NOT_ACTIVE', 'Only an active goal can be your primary goal.');
        await tx.goal.updateMany({ where: { userId: user.id, isPrimary: true }, data: { isPrimary: false } });
      }
      const updated = await tx.goal.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          motivation: dto.motivation,
          successMeasure: dto.successMeasure,
          category: dto.category,
          targetDate: dto.targetDate === null ? null : dto.targetDate ? toDbDate(dto.targetDate) : undefined,
          targetValue: dto.targetValue === null ? null : dto.targetValue,
          targetUnit: dto.targetUnit === null ? null : dto.targetUnit,
          progressCommitmentId: dto.progressCommitmentId === null ? null : dto.progressCommitmentId,
          notes: dto.notes,
          isPrimary: dto.isPrimary ? true : undefined,
        },
      });
      await this.audit.record({ userId: user.id, action: 'GOAL_UPDATED', entityType: 'Goal', entityId: id, metadata: { fields: Object.keys(dto) } }, tx);
      return this.detail(tx, user, updated);
    });
  }

  async activate(user: AuthUser, id: string) {
    return this.transition(user, id, ['DRAFT'], 'ACTIVE', 'GOAL_ACTIVATED');
  }

  async pause(user: AuthUser, id: string) {
    return this.transition(user, id, ['ACTIVE'], 'PAUSED', 'GOAL_PAUSED');
  }

  async resume(user: AuthUser, id: string) {
    return this.transition(user, id, ['PAUSED'], 'ACTIVE', 'GOAL_RESUMED');
  }

  /** Completion always requires explicit confirmation from the user (never automatic). */
  async complete(user: AuthUser, id: string, dto: CompleteGoalDto) {
    return this.transition(user, id, ['ACTIVE', 'PAUSED'], 'COMPLETED', 'GOAL_COMPLETED', dto.notes);
  }

  /** Delete: hard delete only for goals without history; otherwise mark ABANDONED (history kept). */
  async remove(user: AuthUser, id: string) {
    const g = await this.repo.findOwned(this.prisma, user.id, id);
    const history = await this.prisma.taskOccurrence.count({
      where: { task: { commitment: { goalId: id } }, OR: [{ actualValue: { not: null } }, { status: { notIn: ['PENDING', 'SKIPPED'] } }] },
    });
    if (history === 0) {
      await this.prisma.tx(async (tx) => {
        await tx.goal.delete({ where: { id } });
        await this.repo.ensurePrimary(tx, user.id);
        await this.accountability.refresh(tx, user.id, todayIn(user.timezone));
        await this.audit.record({ userId: user.id, action: 'GOAL_DELETED', entityType: 'Goal', entityId: id, metadata: { title: g.title } }, tx);
      });
      return { id, deleted: true, abandoned: false };
    }
    if (g.status === 'COMPLETED' || g.status === 'ABANDONED') {
      throw conflict('GOAL_READ_ONLY', 'This goal is closed and keeps its history.');
    }
    await this.transition(user, id, ['DRAFT', 'ACTIVE', 'PAUSED'], 'ABANDONED', 'GOAL_ABANDONED');
    return { id, deleted: false, abandoned: true };
  }

  private async transition(
    user: AuthUser,
    id: string,
    from: GoalStatus[],
    to: GoalStatus,
    action: 'GOAL_ACTIVATED' | 'GOAL_PAUSED' | 'GOAL_RESUMED' | 'GOAL_COMPLETED' | 'GOAL_ABANDONED',
    notes?: string,
  ) {
    return this.prisma.tx(async (tx) => {
      const g = await this.repo.findOwned(tx, user.id, id);
      if (!from.includes(g.status)) {
        throw conflict('INVALID_GOAL_TRANSITION', `A ${g.status.toLowerCase()} goal can’t be moved to ${to.toLowerCase()}.`);
      }
      if (to === 'ACTIVE') await this.assertGoalCapacity(tx, user.id);
      const now = new Date();
      const today = todayIn(user.timezone);
      const updated = await tx.goal.update({
        where: { id },
        data: {
          status: to,
          pausedAt: to === 'PAUSED' ? now : to === 'ACTIVE' ? null : undefined,
          completedAt: to === 'COMPLETED' ? now : undefined,
          isPrimary: to === 'ACTIVE' ? undefined : false,
          notes: notes ?? undefined,
        },
      });
      const todays = { task: { commitment: { goalId: id } }, actualValue: null, scheduledDate: { in: [toDbDate(today), toDbDate(startOfWeek(today))] } };
      if (to === 'ACTIVE') {
        await tx.taskOccurrence.updateMany({ where: { ...todays, status: 'SKIPPED' }, data: { status: 'PENDING' } });
        const acc = await this.accountability.loadUser(tx, user.id);
        await this.generator.generateForDate(tx, acc, today);
        await this.accountability.ensureCheckIn(tx, acc, today);
      } else {
        await tx.taskOccurrence.updateMany({ where: { ...todays, status: 'PENDING' }, data: { status: 'SKIPPED' } });
      }
      await this.repo.ensurePrimary(tx, user.id);
      await this.accountability.refresh(tx, user.id, today);
      await this.audit.record({ userId: user.id, action, entityType: 'Goal', entityId: id, metadata: { from: g.status, to } }, tx);
      return this.detail(tx, user, (await tx.goal.findUnique({ where: { id } })) ?? updated);
    });
  }
}
