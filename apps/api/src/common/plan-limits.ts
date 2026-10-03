import { SubscriptionPlan } from '@prisma/client';

/** Product limits (spec §57). Product decisions — tune freely. Disable with PLAN_LIMITS_ENABLED=false. */
export const PLAN_LIMITS: Record<SubscriptionPlan, { activeGoals: number; activeCommitments: number }> = {
  FREE: { activeGoals: 1, activeCommitments: 5 },
  PRO: { activeGoals: 10, activeCommitments: 50 },
  COACH: { activeGoals: 10, activeCommitments: 50 },
};

export const planLimitsEnabled = () => process.env.PLAN_LIMITS_ENABLED !== 'false';
