import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />;
}

/** Page-level loading placeholder: announces "loading" once instead of every skeleton block. */
export function PageSkeleton({ label, blocks = ['h-8 w-60', 'h-40', 'h-24', 'h-24'] }: { label: string; blocks?: string[] }) {
  return (
    <div className="grid gap-4" role="status" aria-busy="true" aria-label={label}>
      {blocks.map((b, i) => (
        <Skeleton key={i} className={b} />
      ))}
    </div>
  );
}
