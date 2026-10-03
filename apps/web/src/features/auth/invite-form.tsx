'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineAlert } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { browserTimezone, timezones } from '@/lib/format';
import { useAcceptInvite, useInvitePreview } from './api';
import { RedirectIfSignedIn } from './redirect-if-signed-in';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Include at least one letter and one number'),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;

/** Mentor invite: the admin sent a one-time link; the mentor sets their own password here. */
export function InviteForm() {
  const params = useSearchParams();
  const token = params.get('token');
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();
  const router = useRouter();
  const [zones, setZones] = useState<string[]>(['UTC']);
  const { register, handleSubmit, formState, setValue } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { timezone: 'UTC', name: '' } });
  const err = formState.errors;

  useEffect(() => {
    const tz = browserTimezone();
    setZones([...new Set([tz, ...timezones()])]);
    setValue('timezone', tz);
  }, [setValue]);
  useEffect(() => {
    if (preview.data) setValue('name', preview.data.name);
  }, [preview.data, setValue]);

  if (!token || preview.isError) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">This invite link doesn’t work</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have expired (links last 7 days) or already been used. Ask your admin for a new one.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </>
    );
  }
  if (preview.isPending) return <Skeleton className="h-72" />;

  const onSubmit = handleSubmit((v) =>
    accept
      .mutateAsync({ token, ...v })
      .then(() => router.replace('/mentor'))
      .catch(() => undefined),
  );

  return (
    <>
      <RedirectIfSignedIn />
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {preview.data.name.split(' ')[0]}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You’ve been invited to mentor on Accountability. Set a password for <span className="font-medium text-foreground">{preview.data.email}</span>.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4">
        {accept.isError && <InlineAlert>{errorMessage(accept.error)}</InlineAlert>}
        <Field id="name" label="Your name" error={err.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!err.name} {...register('name')} />
        </Field>
        <Field id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={err.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!err.password} {...register('password')} />
        </Field>
        <Field id="timezone" label="Timezone" hint="Your morning summary and reminders follow this timezone.">
          <Select id="timezone" {...register('timezone')}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Create my mentor account
        </Button>
      </form>
    </>
  );
}
