import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AccountabilityService } from '../accountability/accountability.service';
import { AuthUser } from '../common/decorators/auth.decorators';
import { addDays, fromDbDate, isoWeekday, localHour, toDbDate } from '../domain/dates';
import { checkInSchedule, checkInWindow } from '../domain/checkin';
import { TasksService } from '../tasks/tasks.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { presentGoal } from '../goals/goals.presenter';
import { GoalsRepository } from '../goals/goals.repository';
import { presentCheckIn } from '../checkins/checkins.service';

/**
 * One aggregated call for the most important screen (spec §76).
 * Also the "lazy" safety net: catches up generation/closing if background jobs didn't run.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountability: AccountabilityService,
    private readonly tasks: TasksService,
    private readonly analytics: AnalyticsService,
    private readonly goals: GoalsRepository,
  ) {}

  async get(user: AuthUser) {
    const now = new Date();
    const { user: acc, today } = await this.accountability.catchUp(user.id, now);
    const yesterday = addDays(today, -1);

    const [goal, goalCount, todayItems, todayDay, yDay, yMissed, yCheckIn, checkIn, streak, week, unread] = await Promise.all([
      this.prisma.goal.findFirst({ where: { userId: user.id, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.goal.count({ where: { userId: user.id } }),
      this.tasks.forDate(user, today),
      this.prisma.dailyAccountability.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(today) } } }),
      this.prisma.dailyAccountability.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(yesterday) } } }),
      this.prisma.taskOccurrence.findMany({
        where: { userId: user.id, scheduledDate: toDbDate(yesterday), period: 'DAY', status: { in: ['MISSED', 'PARTIAL'] } },
        select: { id: true, title: true, status: true, completionPercentage: true },
      }),
      this.prisma.checkIn.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(yesterday) } } }),
      this.prisma.checkIn.findUnique({ where: { userId_date: { userId: user.id, date: toDbDate(today) } } }),
      this.prisma.streak.findUnique({ where: { userId: user.id } }),
      this.analytics.week(user, today),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    const progressTotal = goal?.progressCommitmentId ? await this.goals.progressTotal(this.prisma, user.id, goal.progressCommitmentId) : undefined;
    const schedule = checkInSchedule(today, acc.checkInTime, acc.timezone);
    const dayItems = todayItems.items.filter((i) => i.period === 'DAY' && i.status !== 'SKIPPED');
    const remaining = dayItems.filter((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS');
    const checkInDone = checkIn?.status === 'COMPLETED' || checkIn?.status === 'LATE';
    const isRestDay = acc.restDays.includes(isoWeekday(today));

    const hour = localHour(acc.timezone, now);
    const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    let nextAction: { type: string; label: string };
    if (goalCount === 0) nextAction = { type: 'CREATE_GOAL', label: 'Create your first goal' };
    else if (!goal) nextAction = { type: 'ACTIVATE_GOAL', label: 'Activate or resume a goal' };
    else if (checkInDone) nextAction = { type: 'DONE', label: 'Today is checked in' };
    else if (dayItems.length === 0) nextAction = { type: isRestDay ? 'REST' : 'CHECK_IN', label: isRestDay ? 'Rest day' : 'Nothing scheduled today' };
    else if (remaining.length > 0 && checkInWindow(schedule, now) === 'BEFORE_REMINDER') {
      nextAction = { type: 'COMPLETE_TASKS', label: `${remaining.length} commitment${remaining.length === 1 ? '' : 's'} left today` };
    } else nextAction = { type: 'CHECK_IN', label: 'Complete today’s check-in' };

    return {
      user: { name: user.name, firstName: user.name.split(' ')[0], greeting, timezone: acc.timezone, checkInTime: acc.checkInTime },
      date: today,
      goal: goal ? presentGoal(goal, { today, progressTotal }) : null,
      hasAnyGoal: goalCount > 0,
      today: {
        date: today,
        isRestDay,
        items: todayItems.items,
        plannedCount: todayDay?.plannedCount ?? dayItems.length,
        completedCount: todayDay?.completedCount ?? 0,
        remainingCount: remaining.length,
        completionPercentage: todayDay?.completionPercentage ?? 0,
        score: todayDay?.dailyScore ?? 0,
        checkIn: {
          ...(checkIn ? presentCheckIn(checkIn) : { status: 'PENDING' as const }),
          scheduledAt: schedule.scheduledAt,
          followUpAt: schedule.followUpAt,
          closesAt: schedule.closesAt,
          window: checkInWindow(schedule, now),
        },
      },
      yesterday:
        yDay && yDay.plannedCount > 0
          ? {
              date: yesterday,
              plannedCount: yDay.plannedCount,
              completedCount: yDay.completedCount,
              completionPercentage: yDay.completionPercentage,
              isSuccessful: yDay.isSuccessful,
              checkInStatus: yCheckIn?.status ?? 'MISSED',
              missed: yMissed.map((m) => ({ id: m.id, title: m.title, status: m.status, completionPercentage: m.completionPercentage })),
            }
          : null,
      streak: {
        current: streak?.currentStreak ?? 0,
        longest: streak?.longestStreak ?? 0,
        previous: streak?.previousStreak ?? 0,
        lastSuccessfulDate: streak?.lastSuccessfulDate ? fromDbDate(streak.lastSuccessfulDate) : null,
        broken: (streak?.currentStreak ?? 0) === 0 && (streak?.previousStreak ?? 0) > 0,
      },
      week: {
        weekStart: week.weekStart,
        completion: week.completionRate,
        score: week.score,
        checkIns: week.checkIns,
        checkInDays: week.checkInDays,
        days: week.days.map((d) => ({ date: d.date, score: d.dailyScore, completion: d.completionPercentage, band: d.band, isToday: d.isToday })),
      },
      notifications: { unread },
      nextAction,
    };
  }
}
