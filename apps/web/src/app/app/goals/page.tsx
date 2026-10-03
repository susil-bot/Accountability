import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GoalsList } from '@/features/goals';

export const metadata: Metadata = { title: 'Goals' };

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsList />
    </Suspense>
  );
}
