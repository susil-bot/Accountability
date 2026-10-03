'use client';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useDisablePush, useEnablePush, usePushState } from './api';

/** "Notifications on this device": Web Push, so reminders arrive even when the app is closed. */
export function PushCard({ description }: { description?: string }) {
  const state = usePushState();
  const enable = useEnablePush();
  const disable = useDisablePush();
  const toast = useToast();
  const s = state.data;

  let body: React.ReactNode = <p className="text-sm text-muted-foreground">Checking this browser…</p>;
  if (s && !s.supported) body = <p className="text-sm text-muted-foreground">This browser can’t receive push notifications. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).</p>;
  else if (s && s.supported && !s.serverEnabled) body = <p className="text-sm text-muted-foreground">Push isn’t configured on this server yet. You’ll still see everything in the bell.</p>;
  else if (s && s.supported) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{s.subscribed ? 'On for this device.' : s.permission === 'denied' ? 'Blocked in your browser settings.' : 'Off for this device.'}</p>
        {s.subscribed ? (
          <Button variant="outline" loading={disable.isPending} onClick={() => disable.mutate()}>
            Turn off
          </Button>
        ) : (
          <Button
            loading={enable.isPending}
            disabled={s.permission === 'denied'}
            onClick={() =>
              enable.mutate(undefined, {
                onSuccess: () => toast({ tone: 'success', message: 'Notifications are on for this device' }),
                onError: (e) => toast({ tone: 'error', message: e instanceof Error ? e.message : 'Couldn’t turn on notifications' }),
              })
            }
          >
            <BellRing /> Turn on
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications on this device</CardTitle>
        <CardDescription>{description ?? 'Get reminders even when the app is closed.'}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
