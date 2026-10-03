'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

type Toast = { id: number; message: string; tone: 'default' | 'error' | 'success'; action?: { label: string; onClick: () => void } };
const Ctx = React.createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.action ? 8000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
              t.tone === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : t.tone === 'success' ? 'bg-card' : 'bg-card',
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="shrink-0 rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => React.useContext(Ctx);
