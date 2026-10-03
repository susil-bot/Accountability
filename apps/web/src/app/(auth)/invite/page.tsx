import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InviteForm } from '@/features/auth';

export const metadata: Metadata = { title: 'Accept invite', robots: { index: false } };

export default function InvitePage() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}
