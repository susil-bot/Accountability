import type { Metadata } from 'next';
import { SessionsView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Sessions' };

export default function Page() {
  return <SessionsView />;
}
