import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Client' };

export default function Page() {
  return (
    <Suspense>
      <ClientView />
    </Suspense>
  );
}
