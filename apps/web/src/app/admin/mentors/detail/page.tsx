import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MentorDetailView } from '@/features/admin';

export const metadata: Metadata = { title: 'Mentor' };

export default function Page() {
  return (
    <Suspense>
      <MentorDetailView />
    </Suspense>
  );
}
