import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db, PrismaService } from '../database/prisma.service';

export type AuditAction =
  | 'USER_REGISTERED'
  | 'USER_UPDATED'
  | 'GOAL_CREATED'
  | 'GOAL_UPDATED'
  | 'GOAL_ACTIVATED'
  | 'GOAL_PAUSED'
  | 'GOAL_RESUMED'
  | 'GOAL_COMPLETED'
  | 'GOAL_ABANDONED'
  | 'GOAL_DELETED'
  | 'COMMITMENT_CREATED'
  | 'COMMITMENT_CHANGED'
  | 'COMMITMENT_PAUSED'
  | 'COMMITMENT_RESUMED'
  | 'COMMITMENT_ARCHIVED'
  | 'TASK_COMPLETED'
  | 'TASK_CHANGED'
  | 'CHECKIN_SUBMITTED'
  | 'EVIDENCE_UPLOADED'
  | 'EVIDENCE_DELETED'
  | 'ADMIN_NOTE_ADDED'
  | 'ADMIN_CREATED'
  | 'ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'MENTOR_INVITED'
  | 'MENTOR_INVITE_REVOKED'
  | 'MENTOR_JOINED'
  | 'MENTOR_CAPACITY_CHANGED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_ACCEPTED'
  | 'ASSIGNMENT_ENDED'
  | 'CLIENT_VIEWED'
  | 'CLIENT_REVIEWED'
  | 'NOTE_CREATED'
  | 'NOTE_EDITED'
  | 'NOTE_ARCHIVED'
  | 'SUMMARY_SHARED'
  | 'SESSION_BOOKED'
  | 'SESSION_CHANGED'
  | 'NUDGE_SENT'
  | 'NUDGE_RULE_CHANGED'
  | 'ACTION_ITEM_CHANGED'
  | 'REPORT_SHARED'
  | 'WHATSAPP_OPT_IN_CHANGED';

/** Append-only audit trail (spec §55). Written inside the caller's transaction when given one. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: { userId: string; actorId?: string; action: AuditAction; entityType: string; entityId?: string; metadata?: Prisma.InputJsonValue },
    db: Db = this.prisma,
  ) {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        actorId: entry.actorId ?? entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
      },
    });
  }
}
