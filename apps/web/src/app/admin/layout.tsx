import { AppShell } from '@/features/shell';

/** Admin area. Static shell; every admin endpoint also checks the role on the server. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell roles={['ADMIN']} wide>
      {children}
    </AppShell>
  );
}
