'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import type { Role } from '@/lib/types';
import { useSession } from './api';
import { homeFor } from './home';

/**
 * Client-side route guard for the statically exported app. It only decides what to RENDER;
 * the API enforces roles and access on every request, so a bypassed guard reveals no data.
 * A signed-in person in another role's area is sent to their own home.
 */
export function RequireSession({ children, requireOnboarded = true, roles }: { children: React.ReactNode; requireOnboarded?: boolean; roles?: Role[] }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const me = session.data;
  const wrongRole = !!me && !!roles && !roles.includes(me.role);
  const needsOnboarding = !!me && me.role === 'USER' && requireOnboarded && !me.onboarded;

  useEffect(() => {
    if (me === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me && wrongRole) router.replace(homeFor(me));
    else if (needsOnboarding) router.replace('/onboarding');
  }, [me, router, pathname, wrongRole, needsOnboarding]);

  if (session.isError) return <ErrorState message={errorMessage(session.error)} onRetry={() => session.refetch()} />;
  if (!me || wrongRole || needsOnboarding) return <PageSkeleton label="Loading your account" />;
  return <>{children}</>;
}
