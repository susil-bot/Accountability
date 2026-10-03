'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/mentoring';
import { useAuditLog, usePeople } from './api';

const ACTIONS = [
  'CLIENT_VIEWED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_ACCEPTED', 'ASSIGNMENT_ENDED', 'NOTE_CREATED', 'NOTE_EDITED', 'SUMMARY_SHARED', 'SESSION_BOOKED', 'SESSION_CHANGED',
  'NUDGE_SENT', 'NUDGE_RULE_CHANGED', 'ACTION_ITEM_CHANGED', 'REPORT_SHARED', 'MENTOR_INVITED', 'MENTOR_JOINED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'WHATSAPP_OPT_IN_CHANGED',
  'CHECKIN_SUBMITTED', 'USER_REGISTERED',
];
const human = (a: string) => a.toLowerCase().replace(/_/g, ' ');

/** Function 10: who did what, filterable by person and action. */
export function AuditView() {
  const people = usePeople();
  const [actorId, setActorId] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const q = useAuditLog({ actorId, userId, action });

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select aria-label="Done by" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Anyone did it</option>
          {people.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.role.toLowerCase()})
            </option>
          ))}
        </Select>
        <Select aria-label="About" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">About anyone</option>
          {people.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Any action</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {human(a)}
            </option>
          ))}
        </Select>
      </div>
      {q.isPending ? (
        <PageSkeleton label="Loading audit log" blocks={['h-12', 'h-12', 'h-12', 'h-12']} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">Did</th>
                  <th className="px-3 py-2 font-medium">About</th>
                </tr>
              </thead>
              <tbody>
                {q.data.pages
                  .flatMap((p) => p.items)
                  .map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(e.createdAt)}</td>
                      <td className="px-3 py-2">{e.actor?.name ?? 'System'}</td>
                      <td className="px-3 py-2">{human(e.action)}</td>
                      <td className="px-3 py-2">{e.subject?.name ?? '–'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {q.hasNextPage && (
            <Button variant="outline" className="justify-self-start" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Show older
            </Button>
          )}
        </>
      )}
    </div>
  );
}
