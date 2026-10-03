import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db, PrismaService } from '../database/prisma.service';
import { AppError, badRequest, conflict } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { AccountabilityService } from '../accountability/accountability.service';
import { OccurrenceGeneratorService } from '../accountability/occurrence-generator.service';
import { CommitmentsRepository } from './commitments.repository';
import { CommitmentInputDto, PauseCommitmentDto, UpdateCommitmentDto } from './commitments.dto';
import { appliesOnDate, frequencyOf, isWeeklyCount, parseRecurrence, RecurrenceError, RecurrenceRule } from '../domain/recurrence';
import { planWarnings } from '../domain/plan-validation';
import { startOfWeek, todayIn, toDbDate } from '../domain/dates';
import { presentCommitment } from './commitments.presenter';
import { PLAN_LIMITS, planLimitsEnabled } from '../common/plan-limits';
import { AuthUser } from '../common/decorators/auth.decorators';

@Injectable()
export class CommitmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: CommitmentsRepository,
    private readonly audit: AuditService,
    private readonly accountability: AccountabilityService,
    private readonly generator: OccurrenceGeneratorService,
  ) {}

  static parseRule(input: unknown): RecurrenceRule {
    try {
      return parseRecurrence(input);
    } catch (e) {
      if (e instanceof RecurrenceError) throw badRequest('INVALID_RECURRENCE', e.message);
      throw e;
    }
  }

  /** Normalise + validate one commitment input. BOOLEAN commitments always target 1. */
  static normalise(input: CommitmentInputDto, today: string) {
    const rule = CommitmentsService.parseRule(input.recurrence);
    const startDate = input.startDate ?? today;
    if (input.endDate && input.endDate < startDate) throw badRequest('INVALID_DATES', 'End date must be after the start date.');
    const targetValue = input.targetUnit === 'BOOLEAN' ? 1 : input.targetValue;
    if (input.targetUnit === 'CUSTOM' && !input.customUnitLabel) {
      throw badRequest('CUSTOM_UNIT_REQUIRED', 'Give your custom unit a name (e.g. "pages").');
    }
    return { rule, startDate, targetValue };
  }

  /** Create commitment + its default task (inside caller's transaction). */
  async createInTx(tx: Db, user: AuthUser, goalId: string, input: CommitmentInputDto, sortOrder = 0) {
    const today = todayIn(user.timezone);
    const { rule, startDate, targetValue } = CommitmentsService.normalise(input, today);
    const c = await tx.commitment.create({
      data: {
        goalId,
        title: input.title,
        description: input.description,
        frequency: frequencyOf(rule),
        recurrence: rule as unknown as Prisma.InputJsonValue,
        targetValue,
        targetUnit: input.targetUnit,
        customUnitLabel: input.customUnitLabel,
        startDate: toDbDate(startDate),
        endDate: input.endDate ? toDbDate(input.endDate) : null,
        preferredTime: input.preferredTime,
        timezone: user.timezone,
        evidenceRequired: input.evidenceRequired ?? false,
        sortOrder,
        tasks: { create: { title: input.title, requiresEvidence: input.evidenceRequired ?? false } },
      },
    });
    await this.audit.record(
      { userId: user.id, action: 'COMMITMENT_CREATED', entityType: 'Commitment', entityId: c.id, metadata: { goalId, title: c.title } },
      tx,
    );
    return c;
  }

  async assertCommitmentCapacity(db: Db, userId: string, adding: number) {
    if (!planLimitsEnabled()) return;
    const sub = await db.subscription.findUnique({ where: { userId } });
    const limit = PLAN_LIMITS[sub?.plan ?? 'FREE'].activeCommitments;
    const current = await this.repo.countActiveForUser(db, userId);
    if (current + adding > limit) {
      throw new AppError(
        'PLAN_LIMIT_REACHED',
        `Your plan allows ${limit} active commitments. Pause or archive one before adding another.`,
        403,
      );
    }
  }

  async warningsForGoal(db: Db, userId: string, goalId: string) {
    const all = await this.repo.listForGoal(db, userId, goalId);
    return planWarnings(
      all
        .filter((c) => c.active)
        .map((c) => ({ recurrence: parseRecurrence(c.recurrence), targetValue: Number(c.targetValue), targetUnit: c.targetUnit })),
    );
  }

  async list(user: AuthUser, goalId: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId: user.id } });
    if (!goal) throw new AppError('GOAL_NOT_FOUND', 'Goal could not be found.', 404);
    const items = await this.repo.listForGoal(this.prisma, user.id, goalId, true);
    return items.map(presentCommitment);
  }

  async create(user: AuthUser, goalId: string, dto: CommitmentInputDto) {
    const result = await this.prisma.tx(async (tx) => {
      const goal = await tx.goal.findFirst({ where: { id: goalId, userId: user.id } });
      if (!goal) throw new AppError('GOAL_NOT_FOUND', 'Goal could not be found.', 404);
      if (goal.status === 'COMPLETED' || goal.status === 'ABANDONED') {
        throw conflict('GOAL_READ_ONLY', 'This goal is closed. Create a new goal to add commitments.');
      }
      await this.assertCommitmentCapacity(tx, user.id, 1);
      const count = await tx.commitment.count({ where: { goalId } });
      const c = await this.createInTx(tx, user, goalId, dto, count);
      if (goal.status === 'ACTIVE') {
        const today = todayIn(user.timezone);
        const acc = await this.accountability.loadUser(tx, user.id);
        await this.generator.generateForDate(tx, acc, today);
        await this.accountability.refresh(tx, user.id, today);
      }
      return { commitment: presentCommitment(c), warnings: await this.warningsForGoal(tx, user.id, goalId) };
    });
    return result;
  }

  /**
   * Edit settings. History is immutable: occurrences snapshot their settings, so past rows keep
   * the old target. Today's occurrence is only adjusted if the user hasn't touched it yet.
   */
  async update(user: AuthUser, id: string, dto: UpdateCommitmentDto) {
    return this.prisma.tx(async (tx) => {
      const c = await this.repo.findOwned(tx, user.id, id);
      if (c.archivedAt) throw conflict('COMMITMENT_ARCHIVED', 'Archived commitments can’t be edited.');
      if (c.goal.status === 'COMPLETED' || c.goal.status === 'ABANDONED') {
        throw conflict('GOAL_READ_ONLY', 'This goal is closed and its commitments are read-only.');
      }

      const oldRule = parseRecurrence(c.recurrence);
      const rule = dto.recurrence ? CommitmentsService.parseRule(dto.recurrence) : oldRule;
      const unit = dto.targetUnit ?? c.targetUnit;
      const targetValue = unit === 'BOOLEAN' ? 1 : dto.targetValue ?? Number(c.targetValue);
      if (unit === 'CUSTOM' && !(dto.customUnitLabel ?? c.customUnitLabel)) {
        throw badRequest('CUSTOM_UNIT_REQUIRED', 'Give your custom unit a name (e.g. "pages").');
      }
      const today = todayIn(user.timezone);
      if (dto.endDate && dto.endDate < today) throw badRequest('INVALID_DATES', 'End date can’t be in the past.');

      const updated = await tx.commitment.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          recurrence: rule as unknown as Prisma.InputJsonValue,
          frequency: frequencyOf(rule),
          targetValue,
          targetUnit: unit,
          customUnitLabel: dto.customUnitLabel,
          preferredTime: dto.preferredTime === null ? null : dto.preferredTime,
          evidenceRequired: dto.evidenceRequired,
          endDate: dto.endDate === null ? null : dto.endDate ? toDbDate(dto.endDate) : undefined,
        },
      });

      const liveTasks = c.tasks.filter((t) => !t.archivedAt);
      const switchedShape = isWeeklyCount(oldRule) !== isWeeklyCount(rule);
      if (switchedShape) {
        // Daily ↔ weekly-count changes the occurrence shape: retire the old task (history stays) and start a new one.
        await tx.task.updateMany({ where: { id: { in: liveTasks.map((t) => t.id) } }, data: { archivedAt: new Date() } });
        await tx.taskOccurrence.updateMany({
          where: { taskId: { in: liveTasks.map((t) => t.id) }, status: 'PENDING', actualValue: null, scheduledEndTime: { gt: new Date() } },
          data: { status: 'SKIPPED' },
        });
        await tx.task.create({ data: { commitmentId: id, title: updated.title, requiresEvidence: updated.evidenceRequired } });
      } else if (dto.title || dto.evidenceRequired !== undefined) {
        await tx.task.updateMany({
          where: { id: { in: liveTasks.map((t) => t.id) } },
          data: { title: dto.title ?? undefined, requiresEvidence: dto.evidenceRequired ?? undefined },
        });
      }

      if (!switchedShape) {
        const date = isWeeklyCount(rule) ? startOfWeek(today) : today;
        await tx.taskOccurrence.updateMany({
          ...this.repo.untouchedOccurrences(tx, id, toDbDate(date)),
          data: {
            title: updated.title,
            targetValue: isWeeklyCount(rule) ? rule.timesPerWeek : targetValue,
            targetUnit: isWeeklyCount(rule) ? 'COUNT' : unit,
            requiresEvidence: updated.evidenceRequired,
          },
        });
      }

      // A schedule change may add (generate) or remove (skip) today's occurrence.
      if (dto.recurrence && !isWeeklyCount(rule) && !appliesOnDate(rule, today)) {
        await tx.taskOccurrence.updateMany({ ...this.repo.untouchedOccurrences(tx, id, toDbDate(today)), data: { status: 'SKIPPED' } });
      }
      if (dto.recurrence && c.goal.status === 'ACTIVE' && c.active) {
        const acc = await this.accountability.loadUser(tx, user.id);
        await this.generator.generateForDate(tx, acc, today);
      }
      await this.accountability.refresh(tx, user.id, today);

      await this.audit.record(
        {
          userId: user.id,
          action: 'COMMITMENT_CHANGED',
          entityType: 'Commitment',
          entityId: id,
          metadata: {
            before: { title: c.title, targetValue: Number(c.targetValue), targetUnit: c.targetUnit, recurrence: c.recurrence, preferredTime: c.preferredTime, evidenceRequired: c.evidenceRequired },
            after: { title: updated.title, targetValue, targetUnit: unit, recurrence: rule, preferredTime: updated.preferredTime, evidenceRequired: updated.evidenceRequired },
          } as unknown as Prisma.InputJsonValue,
        },
        tx,
      );
      return { commitment: presentCommitment(updated), warnings: await this.warningsForGoal(tx, user.id, c.goalId) };
    });
  }

  async pause(user: AuthUser, id: string, dto: PauseCommitmentDto) {
    return this.prisma.tx(async (tx) => {
      const c = await this.repo.findOwned(tx, user.id, id);
      if (c.archivedAt) throw conflict('COMMITMENT_ARCHIVED', 'Archived commitments can’t be paused.');
      const today = todayIn(user.timezone);
      if (dto.resumeAt && dto.resumeAt <= today) throw badRequest('INVALID_DATES', 'Resume date must be in the future.');
      const updated = await tx.commitment.update({
        where: { id },
        data: { active: false, pausedAt: new Date(), resumeAt: dto.resumeAt ? toDbDate(dto.resumeAt) : null },
      });
      await this.skipUntouchedToday(tx, id, today);
      await this.accountability.refresh(tx, user.id, today);
      await this.audit.record({ userId: user.id, action: 'COMMITMENT_PAUSED', entityType: 'Commitment', entityId: id, metadata: { resumeAt: dto.resumeAt ?? null } }, tx);
      return presentCommitment(updated);
    });
  }

  async resume(user: AuthUser, id: string) {
    return this.prisma.tx(async (tx) => {
      const c = await this.repo.findOwned(tx, user.id, id);
      if (c.archivedAt) throw conflict('COMMITMENT_ARCHIVED', 'Archived commitments can’t be resumed.');
      await this.assertCommitmentCapacity(tx, user.id, c.active ? 0 : 1);
      const updated = await tx.commitment.update({ where: { id }, data: { active: true, pausedAt: null, resumeAt: null } });
      const today = todayIn(user.timezone);
      await tx.taskOccurrence.updateMany({ ...this.repo.untouchedOccurrences(tx, id, toDbDate(today), ['SKIPPED']), data: { status: 'PENDING' } });
      if (c.goal.status === 'ACTIVE') {
        const acc = await this.accountability.loadUser(tx, user.id);
        await this.generator.generateForDate(tx, acc, today);
      }
      await this.accountability.refresh(tx, user.id, today);
      await this.audit.record({ userId: user.id, action: 'COMMITMENT_RESUMED', entityType: 'Commitment', entityId: id }, tx);
      return presentCommitment(updated);
    });
  }

  /** "Delete": hard delete only if the commitment never produced history; otherwise archive. */
  async remove(user: AuthUser, id: string) {
    return this.prisma.tx(async (tx) => {
      const c = await this.repo.findOwned(tx, user.id, id);
      const today = todayIn(user.timezone);
      const touched = await tx.taskOccurrence.count({
        where: { task: { commitmentId: id }, OR: [{ actualValue: { not: null } }, { status: { notIn: ['PENDING', 'SKIPPED'] } }] },
      });
      if (touched === 0) {
        await tx.commitment.delete({ where: { id } });
        await this.accountability.refresh(tx, user.id, today);
        await this.audit.record({ userId: user.id, action: 'COMMITMENT_ARCHIVED', entityType: 'Commitment', entityId: id, metadata: { hardDeleted: true, title: c.title } }, tx);
        return { id, deleted: true, archived: false };
      }
      await tx.commitment.update({ where: { id }, data: { active: false, archivedAt: new Date() } });
      await tx.task.updateMany({ where: { commitmentId: id, archivedAt: null }, data: { archivedAt: new Date() } });
      await this.skipUntouchedToday(tx, id, today);
      await this.accountability.refresh(tx, user.id, today);
      await this.audit.record({ userId: user.id, action: 'COMMITMENT_ARCHIVED', entityType: 'Commitment', entityId: id, metadata: { title: c.title } }, tx);
      return { id, deleted: false, archived: true };
    });
  }

  private async skipUntouchedToday(tx: Db, commitmentId: string, today: string) {
    for (const d of [today, startOfWeek(today)]) {
      await tx.taskOccurrence.updateMany({ ...this.repo.untouchedOccurrences(tx, commitmentId, toDbDate(d)), data: { status: 'SKIPPED' } });
    }
  }
}
