'use client';
import { Archive, Pause, Pencil, Play, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, toneForPercentage } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { formatDate, hhmmTo12, targetLabel } from '@/lib/format';
import type { Commitment } from '@/lib/types';
import { useCommitmentAction, type GoalConsistency } from './api';

export function CommitmentList({
  commitments,
  consistency,
  readOnly,
  onAdd,
  onEdit,
}: {
  commitments: Commitment[];
  consistency?: GoalConsistency;
  readOnly: boolean;
  onAdd: () => void;
  onEdit: (c: Commitment) => void;
}) {
  const toast = useToast();
  const action = useCommitmentAction();
  const stats = new Map((consistency?.commitments ?? []).map((c) => [c.commitmentId, c]));
  const live = commitments.filter((c) => c.status !== 'ARCHIVED');
  const archived = commitments.length - live.length;
  const run = (id: string, a: 'pause' | 'resume' | 'archive') => action.mutate({ id, action: a }, { onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Commitments</CardTitle>
          <p className="text-sm text-muted-foreground">Last 30 days consistency</p>
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {live.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No commitments yet. Add one concrete action you can do consistently.</p>
        ) : (
          <ul className="grid gap-2">
            {live.map((c) => {
              const s = stats.get(c.id);
              return (
                <li key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.schedule}
                        {c.recurrence?.type !== 'TIMES_PER_WEEK' && ` · ${targetLabel(c.targetValue, c.targetUnit, c.customUnitLabel)}`}
                        {c.preferredTime && ` · ${hhmmTo12(c.preferredTime)}`}
                        {c.evidenceRequired && ' · evidence'}
                      </p>
                    </div>
                    {c.status === 'PAUSED' && <Badge tone="warning">Paused{c.resumeAt ? ` until ${formatDate(c.resumeAt)}` : ''}</Badge>}
                  </div>
                  {s && s.completionRate !== null && (
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={s.completionRate} tone={toneForPercentage(s.completionRate)} label={`${c.title} consistency`} className="h-1.5" />
                      <span className="shrink-0 text-xs tabular text-muted-foreground">
                        {s.completionRate}% · {s.completed}/{s.planned}
                      </span>
                    </div>
                  )}
                  {!readOnly && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                        <Pencil /> Edit
                      </Button>
                      {c.status === 'ACTIVE' ? (
                        <Button size="sm" variant="ghost" onClick={() => run(c.id, 'pause')}>
                          <Pause /> Pause
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => run(c.id, 'resume')}>
                          <Play /> Resume
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => run(c.id, 'archive')}>
                        <Archive /> Archive
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {archived > 0 && <p className="mt-3 text-xs text-muted-foreground">{archived} archived commitment(s) — history kept.</p>}
      </CardContent>
    </Card>
  );
}
