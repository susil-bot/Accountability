'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Segment error boundary: a crash in one screen keeps the navigation shell usable. */
export default function AppSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="grid place-items-center rounded-xl border bg-card px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">This screen hit a problem</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your data is safe. Try again, or use the menu to go elsewhere.</p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
