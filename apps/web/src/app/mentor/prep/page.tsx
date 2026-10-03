import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrepView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Prep sheet' };

export default function Page() {
  return (
    <Suspense>
      <PrepView />
    </Suspense>
  );
}
