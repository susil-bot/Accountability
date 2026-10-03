import { AppShell } from '@/features/shell';

/** Mentor workspace (admins may open client pages here too). Static shell; data loads client-side. */
export default function MentorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell roles={['MENTOR', 'ADMIN']} wide>
      {children}
    </AppShell>
  );
}
