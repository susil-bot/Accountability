'use client';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogOut } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { timezones, WEEKDAYS } from '@/lib/format';
import type { Me, NotificationPreference } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { ToggleChip, toggleIn } from '@/components/ui/toggle-chip';
import { useToast } from '@/components/ui/toast';
import { useLogout, useSession, useUpdateNotificationPreferences, useUpdateProfile } from '@/features/auth';
import { MyMentorCard } from '@/features/mentoring-client';
import { PushCard } from '@/features/push';

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  timezone: z.string().min(1),
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a time'),
  restDays: z.array(z.number().int().min(1).max(7)).max(6, 'Keep at least one working day'),
});
type ProfileValues = z.infer<typeof profileSchema>;

export function SettingsView() {
  const me = useSession();
  if (me.isPending) return <PageSkeleton label="Loading settings" blocks={['h-8 w-40', 'h-96', 'h-64']} />;
  if (me.isError || !me.data) return <ErrorState message={errorMessage(me.error)} onRetry={() => me.refetch()} />;
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <ProfileForm me={me.data} />
      <MyMentorCard />
      {me.data.notificationPreference && <NotificationPrefs prefs={me.data.notificationPreference} />}
      <PushCard description="Check-in reminders, messages from your mentor and call reminders — even when the app is closed." />
      <AccountActions />
    </div>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const [zones, setZones] = useState<string[]>([me.timezone]);
  useEffect(() => setZones([...new Set([me.timezone, ...timezones()])]), [me.timezone]);

  const { register, control, handleSubmit, formState, reset } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: me.name, timezone: me.timezone, checkInTime: me.checkInTime, restDays: me.restDays },
  });
  const err = formState.errors;

  const onSubmit = handleSubmit((v) =>
    update
      .mutateAsync(v)
      .then((saved) => {
        reset({ name: saved.name, timezone: saved.timezone, checkInTime: saved.checkInTime, restDays: saved.restDays });
        toast({ tone: 'success', message: 'Settings saved' });
      })
      .catch((e) => toast({ tone: 'error', message: errorMessage(e) })),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile & schedule</CardTitle>
        <CardDescription>Your day, check-in deadline and streak all follow your timezone.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <Field id="s-name" label="Name" error={err.name?.message}>
            <Input id="s-name" autoComplete="name" aria-invalid={!!err.name} {...register('name')} />
          </Field>
          <Field id="s-email" label="Email">
            <Input id="s-email" value={me.email} disabled readOnly />
          </Field>
          <Field id="s-tz" label="Timezone">
            <Select id="s-tz" {...register('timezone')}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="s-time" label="Daily check-in time" hint="Reminder at this time; a follow-up an hour later; the day closes at midnight." error={err.checkInTime?.message}>
            <Input id="s-time" type="time" className="w-40" aria-invalid={!!err.checkInTime} {...register('checkInTime')} />
          </Field>
          <Controller
            control={control}
            name="restDays"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Rest days</legend>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <ToggleChip key={d.iso} className="px-0 text-xs" pressed={field.value.includes(d.iso)} onPressedChange={(on) => field.onChange(toggleIn(field.value, d.iso, on))}>
                      {d.short}
                    </ToggleChip>
                  ))}
                </div>
                {err.restDays?.message && (
                  <p role="alert" className="mt-1 text-xs font-medium text-danger">
                    {err.restDays.message}
                  </p>
                )}
              </fieldset>
            )}
          />
          <Button type="submit" className="justify-self-start" loading={formState.isSubmitting} disabled={!formState.isDirty}>
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const PREFS: [keyof NotificationPreference, string][] = [
  ['checkinReminderEnabled', 'Check-in reminders'],
  ['taskReminderEnabled', 'Commitment reminders'],
  ['weeklyReviewEnabled', 'Weekly review'],
  ['emailEnabled', 'Email'],
];

function NotificationPrefs({ prefs }: { prefs: NotificationPreference }) {
  const toast = useToast();
  const save = useUpdateNotificationPreferences();
  const [value, setValue] = useState(prefs);
  useEffect(() => setValue(prefs), [prefs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>We keep reminders few and useful. Reminders appear in the app and, if you turn them on below, as notifications on this device.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {PREFS.map(([k, label]) => (
          <label key={k} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 text-sm">
            {label}
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={value[k]}
              onChange={(e) => {
                const prev = value;
                const next = { ...value, [k]: e.target.checked };
                setValue(next);
                save.mutate(
                  { [k]: e.target.checked },
                  {
                    onError: (err) => {
                      setValue(prev);
                      toast({ tone: 'error', message: errorMessage(err) });
                    },
                  },
                );
              }}
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function AccountActions() {
  const logout = useLogout();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => logout.mutate(false)} loading={logout.isPending && logout.variables === false}>
          <LogOut /> Sign out
        </Button>
        <Button variant="ghost" onClick={() => logout.mutate(true)} loading={logout.isPending && logout.variables === true}>
          Sign out of all devices
        </Button>
      </CardContent>
    </Card>
  );
}
