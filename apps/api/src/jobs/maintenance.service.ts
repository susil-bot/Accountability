import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AccountabilityService } from '../accountability/accountability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { checkInSchedule, checkInWindow } from '../domain/checkin';
import { toDbDate } from '../domain/dates';

/**
 * Per-user maintenance run by the background worker (and callable directly in tests):
 *  - generate-daily-occurrences, mark-missed-checkins, calculate-daily-accountability → catchUp()
 *  - send-checkin-reminders (reminder at check-in time, follow-up +60 min) → in-app notifications
 * Every step is idempotent, so retries and overlapping runs are safe.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountability: AccountabilityService,
    private readonly notifications: NotificationsService,
  ) {}

  async runForUser(userId: string, now: Date = new Date()) {
    const { user, today } = await this.accountability.catchUp(userId, now);
    const [checkIn, prefs, planned] = await Promise.all([
      this.prisma.checkIn.findUnique({ where: { userId_date: { userId, date: toDbDate(today) } } }),
      this.prisma.notificationPreference.findUnique({ where: { userId } }),
      this.prisma.taskOccurrence.count({ where: { userId, scheduledDate: toDbDate(today), period: 'DAY', status: { not: 'SKIPPED' } } }),
    ]);
    if (planned === 0 || checkIn?.status !== 'PENDING' || prefs?.checkinReminderEnabled === false) return { today, reminders: 0 };

    const schedule = checkInSchedule(today, user.checkInTime, user.timezone);
    const window = checkInWindow(schedule, now);
    let reminders = 0;
    if (window === 'OPEN' || window === 'FOLLOW_UP') {
      const created = await this.notifications.createOnce(this.prisma, {
        userId,
        type: 'CHECKIN_REMINDER',
        dedupeKey: `CHECKIN_REMINDER:${today}`,
        title: 'Your accountability check-in is ready',
        body: 'Take two minutes to record how today went.',
        scheduledAt: schedule.scheduledAt,
      });
      if (created) reminders++;
    }
    if (window === 'FOLLOW_UP') {
      const created = await this.notifications.createOnce(this.prisma, {
        userId,
        type: 'CHECKIN_REMINDER',
        dedupeKey: `CHECKIN_FOLLOWUP:${today}`,
        title: 'Still time to check in today',
        body: 'Your check-in closes at midnight. A quick, honest update keeps your record accurate.',
        scheduledAt: schedule.followUpAt,
      });
      if (created) reminders++;
    }
    return { today, reminders };
  }
}
