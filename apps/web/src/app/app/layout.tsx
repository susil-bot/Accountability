import { AppShell } from '@/features/shell';

/** Authenticated area: a static shell; data loads client-side per user (see docs/architecture.md → Rendering). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
