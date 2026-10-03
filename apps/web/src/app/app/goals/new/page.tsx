import type { Metadata } from 'next';
import { GoalWizard } from '@/features/goals';

export const metadata: Metadata = { title: 'New goal' };

export default function NewGoalPage() {
  return <GoalWizard mode="new" />;
}
