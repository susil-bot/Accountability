'use client';
import { useEffect, useState } from 'react';
import { Check, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { progressLabel, targetLabel, unitSuffix } from '@/lib/format';
import type { Occurrence } from '@/lib/types';
import { useTaskMutation } from './api';
import { STATUS_TEXT } from './status-icon';
import { EvidencePanel } from './evidence-panel';

export function TaskSheet({ occ, open, onOpenChange }: { occ: Occurrence | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const m = useTaskMutation();
  const [value, setValue] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);

  // Reset local edit state only when a DIFFERENT task is opened — background refetches of the
  // same task must not wipe what the user is typing or collapse the evidence panel.
  const occId = occ?.id;
  useEffect(() => {
    if (!occ) return;
    setValue(occ.actualValue ?? 0);
    setShowEvidence(occ.requiresEvidence || occ.evidenceCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occId]);

  if (!occ) return null;
  const boolean = occ.targetUnit === 'BOOLEAN';
  const step = occ.targetUnit === 'MINUTES' ? 5 : 1;
  const run = (kind: 'complete' | 'partial' | 'miss' | 'reset' | 'progress', v?: number) =>
    m.mutate({ occ, kind, value: v }, { onSuccess: () => kind !== 'progress' && onOpenChange(false) });

  const description = occ.period === 'WEEK' ? `${targetLabel(occ.targetValue, 'COUNT')} times this week` : `Target: ${targetLabel(occ.targetValue, occ.targetUnit, occ.unitLabel)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={occ.title} description={description}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={occ.status === 'COMPLETED' ? 'success' : occ.status === 'PARTIAL' || occ.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}>{STATUS_TEXT[occ.status]}</Badge>
          {!boolean && <span className="text-sm text-muted-foreground tabular">{progressLabel(occ.actualValue, occ.targetValue, occ.period === 'WEEK' ? 'COUNT' : occ.targetUnit, occ.unitLabel)}</span>}
          {occ.completedLate && <Badge>Completed late</Badge>}
        </div>

        {!occ.editable ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">This task is locked — it ended more than 48 hours ago.</p>
        ) : boolean && occ.period === 'DAY' ? (
          <div className="grid gap-2">
            <Button size="lg" onClick={() => run('complete')} disabled={m.isPending}>
              <Check /> Mark as done
            </Button>
            <Button size="lg" variant="outline" onClick={() => run('miss')} disabled={m.isPending}>
              <X /> I didn’t do this
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Decrease" onClick={() => setValue((v) => Math.max(0, +(v - step).toFixed(2)))}>
                <Minus />
              </Button>
              <label className="sr-only" htmlFor="actual">
                Amount done
              </label>
              <Input id="actual" type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(value) ? value : ''} onChange={(e) => setValue(e.target.valueAsNumber)} className="h-12 text-center text-lg font-semibold tabular" />
              <Button variant="outline" size="icon" aria-label="Increase" onClick={() => setValue((v) => +((Number.isFinite(v) ? v : 0) + step).toFixed(2))}>
                <Plus />
              </Button>
              <span className="w-12 text-sm text-muted-foreground">{occ.period === 'WEEK' ? 'times' : unitSuffix(occ.targetUnit, occ.unitLabel)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" variant="secondary" onClick={() => run('progress', value)} disabled={m.isPending || !Number.isFinite(value)}>
                Save progress
              </Button>
              <Button size="lg" onClick={() => run('complete', Math.max(value, occ.targetValue))} disabled={m.isPending}>
                <Check /> Done
              </Button>
            </div>
            {occ.period === 'DAY' && (
              <Button variant="ghost" onClick={() => run('miss')} disabled={m.isPending}>
                <X /> I didn’t do this today
              </Button>
            )}
          </div>
        )}

        {occ.editable && occ.dayOpen && occ.status !== 'PENDING' && (
          <Button variant="link" className="mt-2" onClick={() => run('reset')} disabled={m.isPending}>
            <RotateCcw /> Reset to not done
          </Button>
        )}

        <div className="mt-5 border-t pt-4">
          {showEvidence ? (
            <>
              <h3 className="mb-2 text-sm font-semibold">
                Evidence {occ.requiresEvidence && <span className="font-normal text-muted-foreground">· requested</span>}
              </h3>
              <EvidencePanel occ={occ} />
            </>
          ) : (
            occ.editable && (
              <Button variant="ghost" size="sm" onClick={() => setShowEvidence(true)}>
                Add evidence (optional)
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
