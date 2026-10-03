import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/skeleton';
import { CalendarView } from '@/features/calendar';

export const metadata: Metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading calendar" />}>
      <CalendarView />
    </Suspense>
  );
}
