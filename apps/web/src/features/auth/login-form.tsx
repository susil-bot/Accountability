'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { InlineAlert } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { useLogin } from './api';
import { destinationFor } from './home';
import { RedirectIfSignedIn } from './redirect-if-signed-in';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const err = formState.errors;

  const onSubmit = handleSubmit((v) =>
    login.mutateAsync(v).then(({ user }) => router.replace(destinationFor(user, params.get('next')))).catch(() => undefined),
  );

  return (
    <>
      <RedirectIfSignedIn />
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to see today’s commitments.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4">
        {login.isError && <InlineAlert>{errorMessage(login.error)}</InlineAlert>}
        <Field id="email" label="Email" error={err.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!err.email} aria-describedby={err.email ? 'email-error' : undefined} {...register('email')} />
        </Field>
        <Field id="password" label="Password" error={err.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!err.password} aria-describedby={err.password ? 'password-error' : undefined} {...register('password')} />
        </Field>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
