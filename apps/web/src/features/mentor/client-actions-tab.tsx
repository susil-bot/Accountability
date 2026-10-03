'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ActionItem } from '@/lib/mentoring';
import { cn } from '@/lib/utils';
import { useActions, useCreateAction, useUpdateAction } from './api';

/** Function 25: agreed actions with owner, due date and status. */
export function ActionsTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const q = useActions(clientId);
  if (q.isPending) return <Skeleton className="h-48" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const open = q.data.filter((a) => a.status === 'OPEN');
  const closed = q.data.filter((a) => a.status !== 'OPEN');
  return (
    <div className="grid gap-4">
      {canEdit && <NewAction clientId={clientId} />}
      <ActionList title="Open" items={open} canEdit={canEdit} />
      {closed.length > 0 && <ActionList title="Done or dropped" items={closed} canEdit={canEdit} />}
    </div>
  );
}

function NewAction({ clientId }: { clientId: string }) {
  const create = useCreateAction(clientId);
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState<'CLIENT' | 'MENTOR'>('CLIENT');
  const [due, setDue] = useState('');
  return (
    <Card className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
      <Input aria-label="Action" placeholder="e.g. Apply to 3 data-analyst roles" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value as 'CLIENT' | 'MENTOR')}>
        <option value="CLIENT">Client does it</option>
        <option value="MENTOR">I do it</option>
      </Select>
      <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <Button
        disabled={!title.trim()}
        loading={create.isPending}
        onClick={() =>
          create.mutate(
            { title: title.trim(), owner, dueDate: due || null },
            { onSuccess: () => (setTitle(''), setDue('')), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) },
          )
        }
      >
        <Plus /> Add
      </Button>
    </Card>
  );
}

function ActionList({ title, items, canEdit }: { title: string; items: ActionItem[]; canEdit: boolean }) {
  const update = useUpdateAction();
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="grid gap-2">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
            {canEdit ? (
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                aria-label={`Done: ${a.title}`}
                checked={a.status === 'DONE'}
                onChange={(e) => update.mutate({ id: a.id, status: e.target.checked ? 'DONE' : 'OPEN' })}
              />
            ) : null}
            <span className={cn('flex-1', a.status !== 'OPEN' && 'text-muted-foreground line-through')}>{a.title}</span>
            <Badge tone={a.owner === 'CLIENT' ? 'primary' : 'neutral'}>{a.owner === 'CLIENT' ? 'Client' : 'Mentor'}</Badge>
            {a.dueDate && <span className={cn('text-xs', a.overdue ? 'font-medium text-danger' : 'text-muted-foreground')}>{a.overdue ? 'Overdue ' : 'Due '}{formatDate(a.dueDate)}</span>}
            {canEdit && a.status === 'OPEN' && (
              <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: a.id, status: 'DROPPED' })}>
                Drop
              </Button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">None.</li>}
      </ul>
    </section>
  );
}
