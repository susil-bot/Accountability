'use client';
import { useRouter } from 'next/navigation';
import { useMarkOnboarded } from './api';

export function SkipOnboarding() {
  const router = useRouter();
  const mark = useMarkOnboarded();
  return (
    <button
      type="button"
      className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
      onClick={() => mark.mutateAsync().catch(() => undefined).finally(() => router.replace('/app/dashboard'))}
    >
      Skip for now
    </button>
  );
}
