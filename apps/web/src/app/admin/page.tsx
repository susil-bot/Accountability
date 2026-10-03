import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OverviewView } from '@/features/admin';

export const metadata: Metadata = { title: 'Admin' };

export default function Page() {
  return (
    <Suspense>
      <OverviewView />
    </Suspense>
  );
}
