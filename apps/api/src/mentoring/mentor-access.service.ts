import { Injectable } from '@nestjs/common';
import { MentorAssignment, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { forbidden, notFound } from '../common/errors/app-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClientAccess {
  client: User;
  /** The client's ACTIVE assignment (null only for an admin viewing an unassigned client). */
  assignment: MentorAssignment | null;
}

/**
 * The single gate between mentor/admin code and a client's data (engineering rule: no other path).
 *  - ADMIN: any active or inactive client account (role USER).
 *  - MENTOR: only a client with an ACTIVE assignment to this mentor, re-checked on every request,
 *    so ending an assignment removes access on the very next call.
 * Anything else answers "not found", so ids of other mentors' clients reveal nothing.
 */
@Injectable()
export class MentorAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async client(actor: AuthUser, clientId: string): Promise<ClientAccess> {
    if (!UUID.test(clientId)) throw notFound('Client');
    if (actor.role === 'ADMIN') {
      const client = await this.prisma.user.findFirst({ where: { id: clientId, role: 'USER' } });
      if (!client) throw notFound('Client');
      const assignment = await this.prisma.mentorAssignment.findFirst({ where: { clientId, status: 'ACTIVE' } });
      return { client, assignment };
    }
    if (actor.role !== 'MENTOR') throw notFound('Client');
    const assignment = await this.prisma.mentorAssignment.findFirst({
      where: { mentorId: actor.id, clientId, status: 'ACTIVE', client: { isActive: true, role: 'USER' } },
      include: { client: true },
    });
    if (!assignment) throw notFound('Client');
    const { client, ...rest } = assignment;
    return { client, assignment: rest };
  }

  /** For actions only the assigned mentor takes (booking sessions, nudges, rules, action items). */
  async assignedMentor(actor: AuthUser, clientId: string): Promise<ClientAccess & { assignment: MentorAssignment }> {
    const access = await this.client(actor, clientId);
    if (!access.assignment || access.assignment.mentorId !== actor.id) {
      throw forbidden('Only the client’s assigned mentor can do this.');
    }
    return access as ClientAccess & { assignment: MentorAssignment };
  }

  activeClientIds(mentorId: string) {
    return this.prisma.mentorAssignment
      .findMany({ where: { mentorId, status: 'ACTIVE', client: { isActive: true } }, select: { clientId: true } })
      .then((rows) => rows.map((r) => r.clientId));
  }
}
