'use client';
import { useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { InlineAlert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { firstName } from '@/lib/mentoring';
import { useNudgeTemplates, useSendNudge } from './api';

const MAX = 500;

/** Send a nudge: pick a template, edit the text, send in-app (+ push); optionally continue on WhatsApp. */
export function NudgeDialog({ client, open, onOpenChange }: { client: { id: string; name: string; streak?: number }; open: boolean; onOpenChange: (o: boolean) => void }) {
  const templates = useNudgeTemplates();
  const send = useSendNudge(client.id);
  const toast = useToast();
  const [template, setTemplate] = useState('CHECKIN_REMINDER');
  const [body, setBody] = useState('');
  const [wa, setWa] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    send.reset();
    setWa(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);

  useEffect(() => {
    const t = templates.data?.find((x) => x.key === template);
    if (!t) return;
    setBody(t.body.replace('{name}', firstName(client.name)).replace('{streak}', String(client.streak ?? 0)).replace('{action}', '…'));
  }, [template, templates.data, client.name, client.streak]);

  const submit = () =>
    send.mutate(
      { template, body: body.trim() },
      {
        onSuccess: (r) => {
          toast({ tone: 'success', message: `Sent to ${firstName(client.name)}` });
          if (r.whatsappUrl) setWa(r.whatsappUrl);
          else onOpenChange(false);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Nudge ${firstName(client.name)}`} description="Arrives in their app and as a notification. Max 3 a day, never between 22:00 and 07:00 their time.">
        {wa ? (
          <div className="grid gap-3">
            <p className="text-sm">Sent in the app. Want to send the same message on WhatsApp too?</p>
            <Button asChild size="lg">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Open WhatsApp
              </a>
            </Button>
            <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {send.isError && <InlineAlert>{errorMessage(send.error)}</InlineAlert>}
            <Field id="nudge-template" label="Template">
              <Select id="nudge-template" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {(templates.data ?? []).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="nudge-body" label="Message" hint={`${body.length}/${MAX}`}>
              <Textarea id="nudge-body" rows={4} maxLength={MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a short, kind message" />
            </Field>
            <Button size="lg" loading={send.isPending} disabled={!body.trim()} onClick={submit}>
              <Send /> Send nudge
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
