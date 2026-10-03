import { NotificationPreference, Subscription, User } from '@prisma/client';

export function presentUser(u: User & { notificationPreference?: NotificationPreference | null; subscription?: Subscription | null }) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    timezone: u.timezone,
    avatarUrl: u.avatarUrl,
    checkInTime: u.checkInTime,
    restDays: u.restDays,
    phone: u.phone,
    mentorWhatsappOptIn: u.mentorWhatsappOptIn,
    onboarded: !!u.onboardedAt,
    plan: u.subscription?.plan ?? 'FREE',
    notificationPreference: u.notificationPreference
      ? {
          emailEnabled: u.notificationPreference.emailEnabled,
          pushEnabled: u.notificationPreference.pushEnabled,
          whatsappEnabled: u.notificationPreference.whatsappEnabled,
          taskReminderEnabled: u.notificationPreference.taskReminderEnabled,
          checkinReminderEnabled: u.notificationPreference.checkinReminderEnabled,
          weeklyReviewEnabled: u.notificationPreference.weeklyReviewEnabled,
        }
      : null,
    createdAt: u.createdAt,
  };
}
