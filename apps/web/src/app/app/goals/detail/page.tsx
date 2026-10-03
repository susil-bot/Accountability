import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/skeleton';
import { GoalDetailView } from '@/features/goals';

export const metadata: Metadata = { title: 'Goal' };

/** `?id=` keeps this route pre-renderable (static export can't build pages for unknown ids). */
export default function GoalDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading goal" />}>
      <GoalDetailView />
    </Suspense>
  );
}
