import * as React from 'react';

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-secondary p-3 text-secondary-foreground [&_svg]:size-6">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border bg-card px-6 py-10 text-center">
      <p className="text-sm font-medium">We couldn’t load this.</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 h-10 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
          Retry
        </button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'danger', children }: { tone?: 'danger' | 'warning'; children: React.ReactNode }) {
  const cls = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning';
  return (
    <div role="alert" className={`flex gap-2 rounded-lg p-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
