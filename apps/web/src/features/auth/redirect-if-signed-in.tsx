'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './api';
import { homeFor } from './home';

/**
 * A visitor who is already signed in when /login, /register or /invite opens goes to their own area.
 * Only the first answer counts: signing in on this page navigates on its own (to `next`), so a later
 * session change must not override that.
 */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const session = useSession();
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !session.isSuccess) return;
    decided.current = true;
    if (session.data) router.replace(homeFor(session.data));
  }, [session.isSuccess, session.data, router]);
  return null;
}
