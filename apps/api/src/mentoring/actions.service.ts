import { Injectable } from '@nestjs/common';
import { ActionItem, ActionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { notFound } from '../common/errors/app-error';
import { fromDbDate, todayIn, toDbDate } from '../domain/dates';
import { MentorAccessService } from './mentor-access.service';

export function presentAction(a: ActionItem, today?: string) {
  const due = a.dueDate ? fromDbDate(a.dueDate) : null;
  return {
    id: a.id,
    clientId: a.clientId,
    owner: a.owner,
    title: a.title,
    dueDate: due,
    status: a.status,
    overdue: a.status === 'OPEN' && !!due && !!today && due < today,
    noteId: a.noteId,
    doneAt: a.doneAt,
    createdAt: a.createdAt,
  };
}

/**
 * Action items agreed in sessions. Client-owned items show in the client's app, where only the client
 * ticks them; mentor-owned items become follow-up reminders. Open items reappear on the next prep sheet.
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentorAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(actor: AuthUser, clientId: string, status?: ActionStatus) {
    const { client } = await this.access.client(actor, clientId);
    const rows = await this.prisma.actionItem.findMany({ where: { clientId, ...(status ? { status } : {}) }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }], take: 200 });
    const today = todayIn(client.timezone);
    return rows.map((a) => presentAction(a, today));
  }

  async create(actor: AuthUser, clientId: string, input: { owner: 'CLIENT' | 'MENTOR'; title: string; dueDate?: string | null }) {
    const { client, assignment } = await this.access.assignedMentor(actor, clientId);
    const a = await this.prisma.tx(async (tx) => {
      const row = await tx.actionItem.create({
        data: { clientId, mentorId: assignment.mentorId, owner: input.owner, title: input.title.trim(), dueDate: input.dueDate ? toDbDate(input.dueDate) : null },
      });
      await this.audit.record({ userId: clientId, actorId: actor.id, action: 'ACTION_ITEM_CHANGED', entityType: 'ActionItem', entityId: row.id, metadata: { created: true, owner: row.owner } }, tx);
      if (row.owner === 'CLIENT') {
        await this.notifications.createOnce(tx, {
          userId: clientId,
          type: 'MENTOR_UPDATE',
          dedupeKey: `ACTION:${row.id}`,
          title: `New action from ${actor.name}`,
          body: row.title,
          scheduledAt: new Date(),
          link: '/app/dashboard#from-mentor',
        });
      }
      return row;
    });
    return presentAction(a, todayIn(client.timezone));
  }

  async update(actor: AuthUser, id: string, input: { title?: string; dueDate?: string | null; status?: ActionStatus }) {
    const a = await this.prisma.actionItem.findUnique({ where: { id } });
    if (!a) throw notFound('Action item');
    const { client } = await this.access.assignedMentor(actor, a.clientId);
    const updated = await this.prisma.actionItem.update({
      where: { id },
      data: {
        title: input.title?.trim() ?? a.title,
        dueDate: input.dueDate === undefined ? a.dueDate : input.dueDate ? toDbDate(input.dueDate) : null,
        status: input.status ?? a.status,
        doneAt: input.status === undefined ? a.doneAt : input.status === 'DONE' ? (a.doneAt ?? new Date()) : null,
      },
    });
    await this.audit.record({ userId: a.clientId, actorId: actor.id, action: 'ACTION_ITEM_CHANGED', entityType: 'ActionItem', entityId: id, metadata: { status: updated.status } });
    return presentAction(updated, todayIn(client.timezone));
  }

  // ── Client side ─────────────────────────────────────────────────────

  async mine(user: AuthUser) {
    const rows = await this.prisma.actionItem.findMany({
      where: { clientId: user.id, owner: 'CLIENT', OR: [{ status: 'OPEN' }, { status: 'DONE', doneAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }] },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
    const today = todayIn(user.timezone);
    return rows.map((a) => presentAction(a, today));
  }

  /** A client can tick only their own client-owned items, and only change the status. */
  async setMine(user: AuthUser, id: string, status: 'OPEN' | 'DONE') {
    const a = await this.prisma.actionItem.findFirst({ where: { id, clientId: user.id, owner: 'CLIENT', status: { in: ['OPEN', 'DONE'] } } });
    if (!a) throw notFound('Action item');
    const updated = await this.prisma.actionItem.update({ where: { id }, data: { status, doneAt: status === 'DONE' ? new Date() : null } });
    await this.audit.record({ userId: user.id, action: 'ACTION_ITEM_CHANGED', entityType: 'ActionItem', entityId: id, metadata: { status } });
    return presentAction(updated, todayIn(user.timezone));
  }
}
