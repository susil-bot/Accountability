'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export type PushState =
  | { supported: false }
  | { supported: true; serverEnabled: boolean; permission: NotificationPermission; subscribed: boolean };

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Whether this browser receives push notifications for the signed-in person. */
export function usePushState() {
  return useQuery({
    queryKey: qk.push,
    queryFn: async (): Promise<PushState> => {
      if (!pushSupported()) return { supported: false };
      const [{ enabled }, reg] = await Promise.all([get<{ enabled: boolean }>('/push/public-key'), navigator.serviceWorker.getRegistration('/')]);
      const sub = await reg?.pushManager.getSubscription();
      return { supported: true, serverEnabled: enabled, permission: Notification.permission, subscribed: !!sub && Notification.permission === 'granted' };
    },
  });
}

export function useEnablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { enabled, publicKey } = await get<{ enabled: boolean; publicKey: string | null }>('/push/public-key');
      if (!enabled || !publicKey) throw new Error('Push notifications aren’t set up on this server yet.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings.');
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await post('/me/push-subscriptions', { endpoint: json.endpoint, keys: json.keys });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.push }),
  });
}

export function useDisablePush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await del('/me/push-subscriptions', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.push }),
  });
}
