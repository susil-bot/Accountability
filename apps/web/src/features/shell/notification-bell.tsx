'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from './api';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const n = useNotifications();
  const readOne = useMarkNotificationRead();
  const readAll = useMarkAllNotificationsRead();
  const router = useRouter();
  const unread = n.data?.unread ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative grid size-11 place-items-center rounded-lg hover:bg-muted"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">{unread}</span>
        )}
      </button>
      <DialogContent title="Notifications">
        {n.data?.items.length ? (
          <ul className="grid gap-2">
            {n.data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!item.readAt) readOne.mutate(item.id);
                    // Only in-app paths are followed (never an absolute URL from data).
                    if (item.link?.startsWith('/') && !item.link.startsWith('//')) {
                      setOpen(false);
                      router.push(item.link);
                    }
                  }}
                  className={cn('w-full rounded-lg border p-3 text-left text-sm', item.readAt ? 'bg-card' : 'border-primary/30 bg-secondary')}
                >
                  <span className="font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-muted-foreground">{item.body}</span>
                  <time dateTime={item.createdAt} className="mt-1 block text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
        )}
        {unread > 0 && (
          <Button variant="outline" className="mt-4 w-full" onClick={() => readAll.mutate()} loading={readAll.isPending}>
            Mark all as read
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
