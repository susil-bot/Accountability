'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from './api';

/**
 * Header + hero actions on the static landing page. Rendered as anonymous in the pre-built HTML,
 * then upgraded to "Open app" once the browser knows a session exists (no server cookie read → page stays SSG).
 */
export function HeaderActions() {
  const session = useSession();
  if (session.data) {
    return (
      <Button asChild size="sm">
        <Link href="/app/dashboard">Open app</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">Get started</Link>
      </Button>
    </>
  );
}

export function HeroActions() {
  const session = useSession();
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Button asChild size="lg">
        <Link href={session.data ? '/app/dashboard' : '/register'}>
          {session.data ? 'Go to today' : 'Start your first goal'} <ArrowRight />
        </Link>
      </Button>
      {!session.data && (
        <Button asChild size="lg" variant="outline">
          <Link href="/login">I have an account</Link>
        </Button>
      )}
    </div>
  );
}
