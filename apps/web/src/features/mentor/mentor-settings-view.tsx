'use client';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { timezones } from '@/lib/format';
import { useLogout, useSession, useUpdateProfile } from '@/features/auth';
import { PushCard } from '@/features/push';
import { DirectoryProfileCard } from './directory-profile-card';

/** Settings for mentors and admins: name, timezone (drives the morning summary), push and sign-out. */
export function MentorSettingsView() {
  const me = useSession();
  const update = useUpdateProfile();
  const logout = useLogout();
  const toast = useToast();
  const [name, setName] = useState('');
  const [tz, setTz] = useState('UTC');
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    if (!me.data) return;
    setName(me.data.name);
    setTz(me.data.timezone);
    setZones([...new Set([me.data.timezone, ...timezones()])]);
  }, [me.data]);
  if (!me.data) return <PageSkeleton label="Loading settings" />;
  const dirty = name.trim() !== me.data.name || tz !== me.data.timezone;

  return (
    <div className="grid max-w-2xl gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your morning summary arrives around 8:00 in this timezone; alerts only between 7:00 and 22:00.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field id="m-name" label="Name">
            <Input id="m-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="m-email" label="Email">
            <Input id="m-email" value={me.data.email} disabled readOnly />
          </Field>
          <Field id="m-tz" label="Timezone">
            <Select id="m-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            className="justify-self-start"
            disabled={!dirty || !name.trim()}
            loading={update.isPending}
            onClick={() =>
              update.mutate({ name: name.trim(), timezone: tz }, { onSuccess: () => toast({ tone: 'success', message: 'Settings saved' }), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) })
            }
          >
            Save changes
          </Button>
        </CardContent>
      </Card>
      {me.data.role === 'MENTOR' && <DirectoryProfileCard />}
      <PushCard description="Call reminders, client alerts and your morning summary — even when the app is closed." />
      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-5">
          <Button variant="outline" onClick={() => logout.mutate(false)}>
            <LogOut /> Sign out
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate(true)}>
            Sign out on all devices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
