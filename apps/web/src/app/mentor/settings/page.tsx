import type { Metadata } from 'next';
import { MentorSettingsView } from '@/features/mentor';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return <MentorSettingsView />;
}
