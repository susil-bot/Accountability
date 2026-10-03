import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientsView } from '@/features/admin';

export const metadata: Metadata = { title: 'Clients' };

export default function Page() {
  return (
    <Suspense>
      <ClientsView />
    </Suspense>
  );
}
