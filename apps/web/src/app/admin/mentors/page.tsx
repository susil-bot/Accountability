import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MentorsView } from '@/features/admin';

export const metadata: Metadata = { title: 'Mentors' };

export default function Page() {
  return (
    <Suspense>
      <MentorsView />
    </Suspense>
  );
}
