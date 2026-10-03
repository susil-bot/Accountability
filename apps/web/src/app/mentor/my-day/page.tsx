import type { Metadata } from 'next';
import { MyDayView } from '@/features/mentor';

export const metadata: Metadata = { title: 'My day' };

export default function Page() {
  return <MyDayView />;
}
