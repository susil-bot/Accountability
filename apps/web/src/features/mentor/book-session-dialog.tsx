'use client';
import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { InlineAlert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { CHANNEL_LABEL, firstName, formatDateTime, isoToLocalInput, localInputToIso, type MentorSession, type SessionChannel } from '@/lib/mentoring';
import { useCreateSession, useUpdateSession } from './api';

function defaultStart() {
  const d = new Date(Date.now() + 24 * 3_600_000);
  d.setMinutes(0, 0, 0);
  d.setHours(19);
  return isoToLocalInput(d.toISOString());
}

/** Book (or move) a call. Times are entered in the mentor's browser time; the client sees their own. */
export function BookSessionDialog({
  open,
  onOpenChange,
  clients,
  clientId,
  session,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clients: { id: string; name: string }[];
  clientId?: string;
  session?: MentorSession;
}) {
  const create = useCreateSession();
  const update = useUpdateSession();
  const toast = useToast();
  const [who, setWho] = useState(clientId ?? clients[0]?.id ?? '');
  const [start, setStart] = useState(defaultStart());
  const [duration, setDuration] = useState('30');
  const [channel, setChannel] = useState<SessionChannel>('WHATSAPP');
  const [link, setLink] = useState('');
  const [repeat, setRepeat] = useState('0');
  const [lead, setLead] = useState('5');

  useEffect(() => {
    if (!open) return;
    create.reset();
    update.reset();
    setWho(session?.clientId ?? clientId ?? clients[0]?.id ?? '');
    setStart(session ? isoToLocalInput(session.startsAt) : defaultStart());
    setDuration(String(session?.durationMin ?? 30));
    setChannel(session?.channel ?? 'WHATSAPP');
    setLink(session?.link ?? '');
    setLead(String(session?.reminderLeadMin ?? 5));
    setRepeat('0');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialise when opened
  }, [open]);

  const err = create.error ?? update.error;
  const linkInvalid = !!link && !/^https:\/\/\S+$/.test(link);
  const submit = () => {
    const base = { startsAt: localInputToIso(start), durationMin: Number(duration), channel, link: link.trim() || null, reminderLeadMin: Number(lead) };
    if (session) {
      update.mutate({ id: session.id, ...base }, { onSuccess: () => (toast({ tone: 'success', message: 'Session updated' }), onOpenChange(false)) });
    } else {
      create.mutate(
        { clientId: who, ...base, repeatWeeks: Number(repeat) },
        {
          onSuccess: (s) => {
            toast({ tone: 'success', message: s.length > 1 ? `${s.length} weekly sessions booked` : `Booked for ${formatDateTime(s[0].startsAt)}` });
            onOpenChange(false);
          },
        },
      );
    }
  };
  const name = clients.find((c) => c.id === who)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={session ? 'Move or edit session' : name ? `Book a call with ${firstName(name)}` : 'Book a call'} description="You both get a reminder before it starts.">
        <div className="grid gap-4">
          {err && <InlineAlert>{errorMessage(err)}</InlineAlert>}
          {!clientId && !session && (
            <Field id="s-client" label="Client">
              <Select id="s-client" value={who} onChange={(e) => setWho(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field id="s-start" label="Date and time" hint="Your local time.">
            <Input id="s-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="s-duration" label="Length">
              <Select id="s-duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {[15, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="s-lead" label="Reminder">
              <Select id="s-lead" value={lead} onChange={(e) => setLead(e.target.value)}>
                <option value="5">5 min before</option>
                <option value="15">15 min before</option>
                <option value="60">1 hour before</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">How</span>
            <Segmented<SessionChannel> label="How" value={channel} onChange={setChannel} options={(Object.keys(CHANNEL_LABEL) as SessionChannel[]).map((c) => ({ value: c, label: CHANNEL_LABEL[c].replace(' call', '') }))} />
          </div>
          {channel === 'VIDEO' && (
            <Field id="s-link" label="Meeting link" error={linkInvalid ? 'Paste an https:// link' : undefined}>
              <Input id="s-link" type="url" placeholder="https://meet.google.com/…" value={link} aria-invalid={linkInvalid} onChange={(e) => setLink(e.target.value)} />
            </Field>
          )}
          {!session && (
            <Field id="s-repeat" label="Repeat">
              <Select id="s-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                <option value="0">Just once</option>
                {[3, 5, 7, 11].map((n) => (
                  <option key={n} value={n}>
                    Weekly, {n + 1} sessions
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button size="lg" loading={create.isPending || update.isPending} disabled={!who || !start || linkInvalid} onClick={submit}>
            <CalendarPlus /> {session ? 'Save changes' : 'Book session'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
