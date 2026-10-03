import type { Me, Role } from '@/lib/types';
import { safeNext } from './safe-redirect';

/** Each role has its own area. Clients who haven't set up a goal go to onboarding first. */
export const HOME: Record<Role, string> = { USER: '/app/dashboard', MENTOR: '/mentor', ADMIN: '/admin' };

const AREAS: Record<Role, string[]> = { USER: ['/app', '/onboarding'], MENTOR: ['/mentor'], ADMIN: ['/admin', '/mentor'] };

export function homeFor(me: Pick<Me, 'role' | 'onboarded'>): string {
  if (me.role === 'USER' && !me.onboarded) return '/onboarding';
  return HOME[me.role];
}

/** Where to go after signing in: the requested page if it belongs to this role's area, otherwise home. */
export function destinationFor(me: Pick<Me, 'role' | 'onboarded'>, next: string | null | undefined): string {
  const home = homeFor(me);
  if (home === '/onboarding') return home;
  const target = safeNext(next, home);
  return AREAS[me.role].some((a) => target === a || target.startsWith(`${a}/`) || target.startsWith(`${a}?`)) ? target : home;
}
