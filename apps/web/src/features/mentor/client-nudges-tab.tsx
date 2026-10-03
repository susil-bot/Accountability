'use client';
import { useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDateTime, type NudgeRule } from '@/lib/mentoring';
import { useCreateRule, useNudges, useRules, useUpdateRule } from './api';
import { NudgeDialog } from './nudge-dialog';

/** Functions 15–16: nudge history and automatic nudge rules. */
export function NudgesTab({ client, canEdit }: { client: { id: string; name: string; streak: number }; canEdit: boolean }) {
  const nudges = useNudges(client.id);
  const rules = useRules(client.id);
  const [send, setSend] = useState(false);
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Automatic nudges</CardTitle>
          <p className="text-sm text-muted-foreground">Each rule sends at most once a day, never during quiet hours, and counts towards the limit of 3 nudges a day.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rules.isPending ? <Skeleton className="h-20" /> : rules.data?.map((r) => <RuleRow key={r.id} r={r} canEdit={canEdit} />)}
          {rules.data?.length === 0 && <p className="text-sm text-muted-foreground">No rules yet.</p>}
          {canEdit && <NewRule clientId={client.id} />}
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sent</h3>
          {canEdit && (
            <Button size="sm" onClick={() => setSend(true)}>
              <MessageCircle /> Send a nudge
            </Button>
          )}
        </div>
        <ul className="grid gap-2">
          {nudges.data?.map((n) => (
            <li key={n.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
              <p>{n.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {formatDateTime(n.sentAt)}
                {n.automatic && <Badge>Automatic</Badge>}
                {n.respondedAt ? <Badge tone="success">Responded</Badge> : <Badge>No response yet</Badge>}
              </p>
            </li>
          ))}
          {nudges.data?.length === 0 && <li className="text-sm text-muted-foreground">No nudges sent yet.</li>}
        </ul>
      </section>
      {send && <NudgeDialog client={client} open={send} onOpenChange={setSend} />}
    </div>
  );
}

function RuleRow({ r, canEdit }: { r: NudgeRule; canEdit: boolean }) {
  const update = useUpdateRule();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{r.summary}</p>
        <p className="text-muted-foreground">“{r.message}”</p>
        {r.lastFiredOn && <p className="text-xs text-muted-foreground">Last sent {r.lastFiredOn}</p>}
      </div>
      {canEdit ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={r.active} onChange={(e) => update.mutate({ id: r.id, active: e.target.checked })} /> On
        </label>
      ) : (
        <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'On' : 'Off'}</Badge>
      )}
    </div>
  );
}

function NewRule({ clientId }: { clientId: string }) {
  const create = useCreateRule(clientId);
  const toast = useToast();
  const [condition, setCondition] = useState<NudgeRule['condition']>('NO_CHECKIN_BY');
  const [time, setTime] = useState('21:30');
  const [days, setDays] = useState('2');
  const [message, setMessage] = useState('Quick reminder: two minutes for today’s check-in?');
  return (
    <div className="grid gap-3 rounded-lg border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="rule-cond" label="When">
          <Select id="rule-cond" value={condition} onChange={(e) => setCondition(e.target.value as NudgeRule['condition'])}>
            <option value="NO_CHECKIN_BY">No check-in by a time</option>
            <option value="MISSED_TASK_DAYS">A task missed several days in a row</option>
            <option value="INACTIVE_DAYS">No activity for several days</option>
          </Select>
        </Field>
        {condition === 'NO_CHECKIN_BY' ? (
          <Field id="rule-time" label="Time (their time)">
            <Input id="rule-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        ) : (
          <Field id="rule-days" label="Days">
            <Input id="rule-days" type="number" min={1} max={14} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        )}
      </div>
      <Field id="rule-msg" label="Message">
        <Textarea id="rule-msg" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Button
        variant="outline"
        className="justify-self-start"
        loading={create.isPending}
        disabled={!message.trim()}
        onClick={() =>
          create.mutate(
            { condition, message: message.trim(), ...(condition === 'NO_CHECKIN_BY' ? { time } : { days: Number(days) }) },
            { onSuccess: () => toast({ tone: 'success', message: 'Rule added' }), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
          )
        }
      >
        <Plus /> Add rule
      </Button>
    </div>
  );
}
