import { Injectable } from '@nestjs/common';
import { NudgeCondition, NudgeRule, Prisma, User } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService, Tx } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { AppError, badRequest, notFound } from '../common/errors/app-error';
import { addDays, fromDbDate, LocalDate, startOfLocalDay, todayIn, toDbDate } from '../domain/dates';
import {
  inQuietHours, NUDGE_MAX_LENGTH, NUDGE_TEMPLATE_KEYS, NUDGE_TEMPLATES, NudgeTemplate, NUDGES_PER_DAY, QUIET_END, QUIET_START, renderTemplate, whatsappLink,
} from '../domain/mentoring';
import { MentorAccessService } from './mentor-access.service';

export const MAX_RULES_PER_CLIENT = 5;
/** A nudge counts as answered when the client checks in or completes a task within this window. */
export const RESPONSE_WINDOW_MS = 24 * 60 * 60_000;

/** Plain text only: strip control characters (keeps newlines), collapse runs of blank lines. */
export function cleanMessage(s: string) {
  return s
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const localTime = (tz: string, now: Date) => DateTime.fromJSDate(now).setZone(tz).toFormat('HH:mm');

/**
 * Nudges (mentor → client messages) and automatic nudge rules. Limits are enforced server-side under a
 * per-client advisory lock: at most 3 per client per local day, none in the client's quiet hours.
 */
@Injectable()
export class NudgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  templates() {
    return NUDGE_TEMPLATE_KEYS.map((key) => ({ key, label: NUDGE_TEMPLATES[key].label, body: NUDGE_TEMPLATES[key].body }));
  }

  async list(actor: AuthUser, clientId: string) {
    await this.access.client(actor, clientId);
    const rows = await this.prisma.nudge.findMany({ where: { clientId }, orderBy: { sentAt: 'desc' }, take: 50 });
    return rows.map((n) => ({ id: n.id, template: n.template, body: n.body, sentAt: n.sentAt, respondedAt: n.respondedAt, automatic: !!n.ruleId }));
  }

  /** Mentor-initiated nudge. Returns a WhatsApp link with the same text when the client opted in. */
  async send(mentor: AuthUser, clientId: string, input: { template: NudgeTemplate; body?: string }, now = new Date()) {
    const { client } = await this.access.assignedMentor(mentor, clientId);
    const streak = await this.prisma.streak.findUnique({ where: { userId: clientId } });
    const text = cleanMessage(
      input.body?.trim() ? input.body : renderTemplate(input.template, { name: client.name.split(' ')[0], streak: streak?.currentStreak ?? 0, action: '' }),
    );
    if (!text) throw badRequest('NUDGE_EMPTY', 'Write a message first.');
    if (text.length > NUDGE_MAX_LENGTH) throw badRequest('NUDGE_TOO_LONG', `Keep the message under ${NUDGE_MAX_LENGTH} characters.`);

    const nudge = await this.prisma.tx((tx) => this.deliver(tx, client, { mentorId: mentor.id, mentorName: mentor.name, template: input.template, body: text }, now));
    await this.audit.record({ userId: clientId, actorId: mentor.id, action: 'NUDGE_SENT', entityType: 'Nudge', entityId: nudge.id, metadata: { template: input.template } });
    return {
      id: nudge.id,
      body: nudge.body,
      sentAt: nudge.sentAt,
      whatsappUrl: client.mentorWhatsappOptIn && client.phone ? whatsappLink(client.phone, text) : null,
    };
  }

  /**
   * Shared by manual nudges and rules. Throws QUIET_HOURS / NUDGE_LIMIT; the caller decides whether that is
   * an error (manual) or a skip (rules).
   */
  private async deliver(tx: Tx, client: User, n: { mentorId: string; mentorName: string; template: string; body: string; ruleId?: string }, now: Date) {
    const t = localTime(client.timezone, now);
    if (inQuietHours(t)) {
      throw new AppError('QUIET_HOURS', `It’s ${t} for ${client.name.split(' ')[0]}. Nudges pause between ${QUIET_START} and ${QUIET_END} their time.`, 409);
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'nudge:' + client.id}))`;
    const dayStart = startOfLocalDay(todayIn(client.timezone, now), client.timezone);
    const sentToday = await tx.nudge.count({ where: { clientId: client.id, sentAt: { gte: dayStart } } });
    if (sentToday >= NUDGES_PER_DAY) {
      throw new AppError('NUDGE_LIMIT', `${client.name.split(' ')[0]} already got ${NUDGES_PER_DAY} nudges today. Try again tomorrow.`, 429);
    }
    const nudge = await tx.nudge.create({ data: { mentorId: n.mentorId, clientId: client.id, ruleId: n.ruleId ?? null, template: n.template, body: n.body, sentAt: now } });
    await this.notifications.createOnce(tx, {
      userId: client.id,
      type: 'MENTOR_NUDGE',
      dedupeKey: `NUDGE:${nudge.id}`,
      title: `Message from ${n.mentorName}`,
      body: n.body,
      scheduledAt: now,
      link: '/app/dashboard#from-mentor',
    });
    return nudge;
  }

  // ── Rules ───────────────────────────────────────────────────────────

  async rules(actor: AuthUser, clientId: string) {
    await this.access.client(actor, clientId);
    const rows = await this.prisma.nudgeRule.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.presentRule(r));
  }

  async createRule(mentor: AuthUser, clientId: string, input: { condition: NudgeCondition; time?: string; days?: number; message: string }) {
    await this.access.assignedMentor(mentor, clientId);
    const count = await this.prisma.nudgeRule.count({ where: { clientId, mentorId: mentor.id, active: true } });
    if (count >= MAX_RULES_PER_CLIENT) throw badRequest('TOO_MANY_RULES', `Up to ${MAX_RULES_PER_CLIENT} active rules per client.`);
    const params = this.params(input);
    const message = cleanMessage(input.message);
    if (!message || message.length > NUDGE_MAX_LENGTH) throw badRequest('INVALID_MESSAGE', `The message must be 1–${NUDGE_MAX_LENGTH} characters.`);
    const rule = await this.prisma.nudgeRule.create({ data: { mentorId: mentor.id, clientId, condition: input.condition, params, message } });
    await this.audit.record({ userId: clientId, actorId: mentor.id, action: 'NUDGE_RULE_CHANGED', entityType: 'NudgeRule', entityId: rule.id, metadata: { created: true, condition: rule.condition } });
    return this.presentRule(rule);
  }

  async updateRule(mentor: AuthUser, id: string, input: { active?: boolean; time?: string; days?: number; message?: string }) {
    const rule = await this.prisma.nudgeRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Rule');
    await this.access.assignedMentor(mentor, rule.clientId);
    if (rule.mentorId !== mentor.id) throw notFound('Rule');
    const params = input.time !== undefined || input.days !== undefined ? this.params({ condition: rule.condition, ...input }) : (rule.params as Prisma.InputJsonValue);
    const message = input.message !== undefined ? cleanMessage(input.message) : rule.message;
    if (!message || message.length > NUDGE_MAX_LENGTH) throw badRequest('INVALID_MESSAGE', `The message must be 1–${NUDGE_MAX_LENGTH} characters.`);
    const updated = await this.prisma.nudgeRule.update({ where: { id }, data: { active: input.active ?? rule.active, params, message } });
    await this.audit.record({ userId: rule.clientId, actorId: mentor.id, action: 'NUDGE_RULE_CHANGED', entityType: 'NudgeRule', entityId: id, metadata: { active: updated.active } });
    return this.presentRule(updated);
  }

  private params(input: { condition: NudgeCondition; time?: string; days?: number }): Prisma.InputJsonValue {
    if (input.condition === 'NO_CHECKIN_BY') {
      if (!input.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw badRequest('INVALID_RULE', 'Choose a time like 21:30.');
      return { time: input.time };
    }
    const days = input.days ?? 0;
    if (!Number.isInteger(days) || days < 1 || days > 14) throw badRequest('INVALID_RULE', 'Choose between 1 and 14 days.');
    return { days };
  }

  private presentRule(r: NudgeRule) {
    const p = r.params as { time?: string; days?: number };
    const summary =
      r.condition === 'NO_CHECKIN_BY'
        ? `If there’s no check-in by ${p.time}`
        : r.condition === 'MISSED_TASK_DAYS'
          ? `If a task is missed ${p.days} day${p.days === 1 ? '' : 's'} in a row`
          : `If there’s no activity for ${p.days} day${p.days === 1 ? '' : 's'}`;
    return { id: r.id, condition: r.condition, params: p, message: r.message, active: r.active, summary, lastFiredOn: r.lastFiredOn && fromDbDate(r.lastFiredOn) };
  }

  /**
   * Runs from the client's 15-minute maintenance. Each rule fires at most once per client-local day
   * (claimed atomically via lastFiredOn) and respects quiet hours and the daily nudge limit.
   */
  async evaluateRules(clientId: string, now = new Date()) {
    const client = await this.prisma.user.findUnique({ where: { id: clientId } });
    if (!client || !client.isActive) return { fired: 0 };
    const assignment = await this.prisma.mentorAssignment.findFirst({ where: { clientId, status: 'ACTIVE' }, include: { mentor: { select: { id: true, name: true } } } });
    if (!assignment) return { fired: 0 };
    const rules = await this.prisma.nudgeRule.findMany({ where: { clientId, mentorId: assignment.mentorId, active: true } });
    if (rules.length === 0) return { fired: 0 };

    const today = todayIn(client.timezone, now);
    let fired = 0;
    for (const rule of rules) {
      if (rule.lastFiredOn && fromDbDate(rule.lastFiredOn) === today) continue;
      if (!(await this.conditionMet(rule, client, today, now))) continue;
      try {
        await this.prisma.tx(async (tx) => {
          const claim = await tx.nudgeRule.updateMany({
            where: { id: rule.id, active: true, OR: [{ lastFiredOn: null }, { lastFiredOn: { not: toDbDate(today) } }] },
            data: { lastFiredOn: toDbDate(today) },
          });
          if (claim.count === 0) return;
          await this.deliver(tx, client, { mentorId: assignment.mentorId, mentorName: assignment.mentor.name, template: `RULE_${rule.condition}`, body: rule.message, ruleId: rule.id }, now);
          fired++;
        });
      } catch (e) {
        // Quiet hours or daily limit: skip silently; the rule may fire later today (claim rolled back).
        if (e instanceof AppError && (e.code === 'QUIET_HOURS' || e.code === 'NUDGE_LIMIT')) continue;
        throw e;
      }
    }
    return { fired };
  }

  private async conditionMet(rule: NudgeRule, client: User, today: LocalDate, now: Date) {
    const p = rule.params as { time?: string; days?: number };
    if (rule.condition === 'NO_CHECKIN_BY') {
      if (!p.time || localTime(client.timezone, now) < p.time) return false;
      const [ci, day] = await Promise.all([
        this.prisma.checkIn.findUnique({ where: { userId_date: { userId: client.id, date: toDbDate(today) } } }),
        this.prisma.dailyAccountability.findUnique({ where: { userId_date: { userId: client.id, date: toDbDate(today) } } }),
      ]);
      return !!day && day.plannedCount > 0 && !day.isRestDay && (!ci || ci.status === 'PENDING');
    }
    const n = p.days ?? 1;
    if (rule.condition === 'INACTIVE_DAYS') {
      const last = client.lastActiveAt ?? client.createdAt;
      return now.getTime() - last.getTime() >= n * 86_400_000;
    }
    // MISSED_TASK_DAYS: each of the last n closed working days had at least one missed task.
    const days = await this.prisma.dailyAccountability.findMany({
      where: { userId: client.id, isFinal: true, isRestDay: false, plannedCount: { gt: 0 }, date: { lt: toDbDate(today), gte: toDbDate(addDays(today, -(n + 7))) } },
      orderBy: { date: 'desc' },
      take: n,
    });
    return days.length === n && days.every((d) => d.missedCount > 0);
  }

  /** Marks nudges as answered when the client checked in or completed a task within 24 hours. */
  async markResponses(clientId: string, now = new Date()) {
    const open = await this.prisma.nudge.findMany({ where: { clientId, respondedAt: null, sentAt: { gte: new Date(now.getTime() - RESPONSE_WINDOW_MS) } } });
    let marked = 0;
    for (const n of open) {
      const [ci, done] = await Promise.all([
        this.prisma.checkIn.findFirst({ where: { userId: clientId, completedAt: { gt: n.sentAt } }, orderBy: { completedAt: 'asc' }, select: { completedAt: true } }),
        this.prisma.taskOccurrence.findFirst({ where: { userId: clientId, completedAt: { gt: n.sentAt } }, orderBy: { completedAt: 'asc' }, select: { completedAt: true } }),
      ]);
      const first = [ci?.completedAt, done?.completedAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
      if (first && first.getTime() - n.sentAt.getTime() <= RESPONSE_WINDOW_MS) {
        await this.prisma.nudge.update({ where: { id: n.id }, data: { respondedAt: first } });
        marked++;
      }
    }
    return { marked };
  }
}
