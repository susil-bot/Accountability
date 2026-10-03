'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, CalendarClock, CalendarDays, ClipboardCheck, Home, LayoutDashboard, LogOut, type LucideIcon, ScrollText, Settings, Sun, Target, UserCog, Users,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';
import { HOME, RequireSession, useLogout, useSession } from '@/features/auth';
import { NotificationBell } from './notification-bell';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  desktopOnly?: boolean;
  /** Exact match only (for area roots like /mentor). */
  exact?: boolean;
}

/** Navigation follows the signed-in person's role, wherever they are. */
const NAV: Record<Role, NavItem[]> = {
  USER: [
    { href: '/app/dashboard', label: 'Today', icon: Home },
    { href: '/app/check-in', label: 'Check-in', icon: ClipboardCheck },
    { href: '/app/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/app/goals', label: 'Goals', icon: Target },
    { href: '/app/analytics', label: 'Insights', icon: BarChart3, desktopOnly: true },
    { href: '/app/settings', label: 'Settings', icon: Settings },
  ],
  MENTOR: [
    { href: '/mentor', label: 'Clients', icon: Users, exact: true },
    { href: '/mentor/my-day', label: 'My day', icon: Sun },
    { href: '/mentor/sessions', label: 'Sessions', icon: CalendarClock },
    { href: '/mentor/settings', label: 'Settings', icon: Settings },
  ],
  ADMIN: [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/admin/clients', label: 'Clients', icon: Users },
    { href: '/admin/mentors', label: 'Mentors', icon: UserCog },
    { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
    { href: '/admin/settings', label: 'Settings', icon: Settings, desktopOnly: true },
  ],
};

/**
 * The signed-in layout for every role. `roles` lists who may be in this area; anyone else is sent to
 * their own home by RequireSession (the API enforces the same rule on every request).
 */
export function AppShell({ children, roles = ['USER'], wide = false }: { children: React.ReactNode; roles?: Role[]; wide?: boolean }) {
  const pathname = usePathname();
  const me = useSession();
  const role: Role = me.data?.role ?? roles[0];
  const nav = NAV[role];
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href || pathname === `${n.href}/` : pathname === n.href || pathname.startsWith(`${n.href}/`));
  const mobile = nav.filter((n) => !n.desktopOnly);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card px-3 py-5 md:flex">
        <Logo href={HOME[role]} className="px-2" />
        {role !== 'USER' && <p className="mt-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{role === 'ADMIN' ? 'Admin' : 'Mentor'}</p>}
        <nav aria-label="Main" className="mt-8 grid gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n) ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium',
                isActive(n) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <n.icon className="size-4" aria-hidden /> {n.label}
            </Link>
          ))}
        </nav>
        <AccountFooter />
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:justify-end md:px-8">
          <Logo href={HOME[role]} className="md:hidden" />
          <NotificationBell />
        </header>
        <main id="main" className={cn('mx-auto w-full flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8', wide ? 'max-w-6xl' : 'max-w-3xl')}>
          <RequireSession roles={roles}>{children}</RequireSession>
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}
      >
        {mobile.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n) ? 'page' : undefined}
            className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive(n) ? 'text-primary' : 'text-muted-foreground')}
          >
            <n.icon className="size-5" aria-hidden />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function AccountFooter() {
  const me = useSession();
  const logout = useLogout();
  return (
    <div className="mt-auto grid gap-1 border-t pt-4">
      <div className="truncate px-3 text-sm font-medium">{me.data?.name ?? ' '}</div>
      <div className="truncate px-3 text-xs text-muted-foreground">{me.data?.email ?? ' '}</div>
      <button
        type="button"
        onClick={() => logout.mutate(false)}
        className="mt-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </div>
  );
}
