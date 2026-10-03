import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5">
      <div className="text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn’t exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have moved, or the link is incomplete.</p>
        <Button asChild className="mt-6">
          <Link href="/app/dashboard">Go to today</Link>
        </Button>
      </div>
    </main>
  );
}
