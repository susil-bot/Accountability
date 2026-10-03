import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MentorSettingsView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <Suspense>
      <MentorSettingsView />
    </Suspense>
  );
}
