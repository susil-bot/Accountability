import type { Metadata } from 'next';
import { CheckInFlow } from '@/features/check-in';

export const metadata: Metadata = { title: 'Check-in' };

export default function CheckInPage() {
  return <CheckInFlow />;
}
