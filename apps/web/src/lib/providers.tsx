'use client';
import * as React from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { ToastProvider } from '@/components/ui/toast';

const PROTECTED = /^\/(app|onboarding)(\/|$)/;

/** Session expired or missing while on a protected route → back to sign-in (the API is the real guard). */
function onAuthError(e: unknown) {
  if (!(e instanceof ApiError) || e.status !== 401 || typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  if (PROTECTED.test(pathname)) window.location.replace(`/login?next=${encodeURIComponent(pathname + search)}`);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onAuthError }),
        mutationCache: new MutationCache({ onError: onAuthError }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
