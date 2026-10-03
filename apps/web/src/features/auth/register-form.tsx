'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { InlineAlert } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { browserTimezone, timezones } from '@/lib/format';
import { useRegister } from './api';
import { RedirectIfSignedIn } from './redirect-if-signed-in';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Include at least one letter and one number'),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const signup = useRegister();
  const [zones, setZones] = useState<string[]>(['UTC']);
  const { register, handleSubmit, formState, setValue } = useForm<Values>({ resolver: zodResolver(registerSchema), defaultValues: { timezone: 'UTC' } });
  const err = formState.errors;

  // The timezone list is browser-specific, so it is built after mount (no hydration mismatch with the static HTML).
  useEffect(() => {
    const tz = browserTimezone();
    setZones([...new Set([tz, ...timezones()])]);
    setValue('timezone', tz);
  }, [setValue]);

  const onSubmit = handleSubmit((v) => signup.mutateAsync(v).then(() => router.replace('/onboarding')).catch(() => undefined));

  return (
    <>
      <RedirectIfSignedIn />
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">It takes about two minutes to set up your first goal.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4">
        {signup.isError && <InlineAlert>{errorMessage(signup.error)}</InlineAlert>}
        <Field id="name" label="Name" error={err.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!err.name} {...register('name')} />
        </Field>
        <Field id="email" label="Email" error={err.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!err.email} {...register('email')} />
        </Field>
        <Field id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={err.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!err.password} aria-describedby="password-hint" {...register('password')} />
        </Field>
        <Field id="timezone" label="Timezone" hint="Your day, reminders and streaks follow this timezone.">
          <Select id="timezone" {...register('timezone')}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
