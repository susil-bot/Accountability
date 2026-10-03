import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountabilityService } from '../accountability/accountability.service';
import { UpdateProfileDto } from './users.dto';
import { presentUser } from './users.presenter';
import { checkInSchedule } from '../domain/checkin';
import { todayIn, toDbDate } from '../domain/dates';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accountability: AccountabilityService,
  ) {}

  async update(userId: string, dto: UpdateProfileDto) {
    const restDays = dto.restDays ? [...new Set(dto.restDays)].sort((a, b) => a - b) : undefined;
    const user = await this.prisma.tx(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { name: dto.name, timezone: dto.timezone, checkInTime: dto.checkInTime, restDays, avatarUrl: dto.avatarUrl },
        include: { notificationPreference: true, subscription: true },
      });
      // Keep today's (still pending) check-in aligned with the new time/timezone.
      if (dto.checkInTime || dto.timezone) {
        const today = todayIn(u.timezone);
        const s = checkInSchedule(today, u.checkInTime, u.timezone);
        await tx.checkIn.updateMany({
          where: { userId, date: toDbDate(today), status: 'PENDING' },
          data: { scheduledAt: s.scheduledAt },
        });
      }
      await this.audit.record(
        { userId, action: 'USER_UPDATED', entityType: 'User', entityId: userId, metadata: { fields: Object.keys(dto) } },
        tx,
      );
      return u;
    });
    this.accountability.invalidateCatchUp(userId);
    if (dto.restDays || dto.timezone) {
      await this.prisma.tx(async (tx) => this.accountability.refresh(tx, userId, todayIn(user.timezone)));
    }
    return presentUser(user);
  }

  async markOnboarded(userId: string) {
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date() },
      include: { notificationPreference: true, subscription: true },
    });
    return presentUser(u);
  }
}
