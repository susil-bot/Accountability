'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useMyMentor, useSetWhatsapp, useStopSharing } from './api';

const PHONE = /^\+[1-9]\d{7,14}$/;

/** Settings → My mentor: who, since when, WhatsApp opt-in and "Stop sharing". */
export function MyMentorCard() {
  const q = useMyMentor();
  const stop = useStopSharing();
  const wa = useSetWhatsapp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [phone, setPhone] = useState('');
  useEffect(() => setPhone(q.data?.whatsapp.phone ?? ''), [q.data?.whatsapp.phone]);
  const a = q.data?.assignment;

  const cleaned = phone.replace(/[\s()-]/g, '');
  const phoneError = cleaned && !PHONE.test(cleaned) ? 'Use international format, e.g. +919876543210' : undefined;

  return (
    <Card id="mentor">
      <CardHeader>
        <CardTitle>My mentor</CardTitle>
        <CardDescription>
          {a?.status === 'ACTIVE'
            ? `${a.mentor.name} can see your progress, check-ins, reflections (except private ones) and evidence. They can’t change anything.`
            : a?.status === 'PENDING'
              ? `${a.mentor.name} has asked to be your mentor. Answer on your Today page.`
              : 'You don’t have a mentor yet. Choose one on the Goals page.'}
        </CardDescription>
      </CardHeader>
      {!a && q.data && (
        <CardContent>
          <Button asChild>
            <Link href="/app/goals?chooseMentor=1">Choose a mentor</Link>
          </Button>
        </CardContent>
      )}
      {a?.status === 'ACTIVE' && q.data && (
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">Mentor since {formatDate(a.since.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
          <div className="grid gap-3 rounded-lg border p-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-[var(--primary)]"
                checked={q.data.whatsapp.optIn}
                disabled={wa.isPending}
                onChange={(e) =>
                  wa.mutate(
                    { optIn: e.target.checked, phone: e.target.checked ? cleaned || null : undefined },
                    { onError: (err) => toast({ tone: 'error', message: errorMessage(err) }) },
                  )
                }
              />
              <span>
                Let my mentor contact me on WhatsApp
                <span className="block text-xs text-muted-foreground">Your number is only used to open a WhatsApp chat. Turn this off any time.</span>
              </span>
            </label>
            <Field id="wa-phone" label="WhatsApp number" error={phoneError}>
              <div className="flex gap-2">
                <Input id="wa-phone" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} aria-invalid={!!phoneError} onChange={(e) => setPhone(e.target.value)} />
                <Button
                  variant="outline"
                  disabled={!!phoneError || !cleaned || cleaned === (q.data.whatsapp.phone ?? '')}
                  loading={wa.isPending}
                  onClick={() =>
                    wa.mutate(
                      { optIn: q.data!.whatsapp.optIn, phone: cleaned },
                      { onSuccess: () => toast({ tone: 'success', message: 'Number saved' }), onError: (err) => toast({ tone: 'error', message: errorMessage(err) }) },
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/app/goals?chooseMentor=1">Change mentor</Link>
            </Button>
            <Button variant="outline" className="text-danger" onClick={() => setConfirm(true)}>
              Stop sharing with {a.mentor.name.split(' ')[0]}
            </Button>
          </div>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Stop sharing with your mentor?"
            description="They lose access straight away and any booked calls are cancelled. The admin will be told so they can help."
            confirmLabel="Stop sharing"
            tone="danger"
            loading={stop.isPending}
            onConfirm={() =>
              stop.mutate(undefined, {
                onSuccess: () => toast({ tone: 'success', message: 'Sharing stopped' }),
                onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
                onSettled: () => setConfirm(false),
              })
            }
          />
        </CardContent>
      )}
    </Card>
  );
}
