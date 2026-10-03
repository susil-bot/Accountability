'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Archive, Check, Pause, Pencil, Play, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Progress } from '@/components/ui/progress';
import { PageSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { CATEGORIES, formatDate, GOAL_STATUS_TONE } from '@/lib/format';
import type { Commitment, GoalDetail } from '@/lib/types';
import { useDeleteGoal, useGoal, useGoalConsistency, useGoalTransition, type GoalTransition } from './api';
import { CommitmentList } from './commitment-list';
import { CommitmentDialog } from './commitment-dialog';
import { EditGoalDialog } from './edit-goal-dialog';
import { NotesCard } from './notes-card';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Goal detail. The id comes from `?id=` so the page can be pre-rendered once (static export). */
export function GoalDetailView() {
  const raw = useSearchParams().get('id');
  const id = raw && UUID.test(raw) ? raw : null;
  const q = useGoal(id);
  const consistency = useGoalConsistency(id);

  if (!id) {
    return (
      <EmptyState
        icon={<Target />}
        title="Goal not found"
        description="This link is incomplete or the goal no longer exists."
        action={
          <Button asChild variant="outline">
            <Link href="/app/goals">Back to goals</Link>
          </Button>
        }
      />
    );
  }
  if (q.isPending) return <PageSkeleton label="Loading goal" blocks={['h-8 w-72', 'h-40', 'h-56']} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  return <GoalDetailBody goal={q.data} consistency={consistency.data} />;
}

function GoalDetailBody({ goal: g, consistency }: { goal: GoalDetail; consistency?: Parameters<typeof CommitmentList>[0]['consistency'] }) {
  const router = useRouter();
  const toast = useToast();
  const transition = useGoalTransition(g.id);
  const remove = useDeleteGoal(g.id);
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null);
  const [confirm, setConfirm] = useState<'complete' | 'abandon' | null>(null);
  const [editGoal, setEditGoal] = useState(false);

  const move = (t: GoalTransition) =>
    transition.mutate(t, { onSuccess: () => setConfirm(null), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) });

  return (
    <div className="grid gap-5">
      <Link href="/app/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Goals
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={GOAL_STATUS_TONE[g.status]}>{g.status.charAt(0) + g.status.slice(1).toLowerCase()}</Badge>
          <span className="text-xs text-muted-foreground">{CATEGORIES.find((c) => c.value === g.category)?.label}</span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{g.title}</h1>
          {!g.readOnly && (
            <Button variant="ghost" size="icon" aria-label="Edit goal details" onClick={() => setEditGoal(true)}>
              <Pencil />
            </Button>
          )}
        </div>
        {g.motivation && <p className="mt-2 text-muted-foreground">“{g.motivation}”</p>}
      </header>

      <Card>
        <CardContent className="grid gap-4 p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Started</dt>
              <dd className="font-medium">{formatDate(g.startDate, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target date</dt>
              <dd className="font-medium">
                {g.targetDate ? formatDate(g.targetDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                {g.daysRemaining !== null && g.status === 'ACTIVE' && (
                  <span className="block text-xs font-normal text-muted-foreground">{g.daysRemaining >= 0 ? `${g.daysRemaining} days left` : 'Past target'}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Success measure</dt>
              <dd className="font-medium">{g.successMeasure || '—'}</dd>
            </div>
          </dl>
          {g.progress.type === 'NUMERIC' ? (
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular">
                  {g.progress.current} / {g.progress.target}
                </span>
              </div>
              <Progress value={g.progress.percentage ?? 0} label="Goal progress" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Progress: {g.progress.completed ? 'Completed' : 'Not completed yet'}</p>
          )}
          {!g.readOnly && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {g.status === 'DRAFT' && (
                <Button onClick={() => move('activate')} loading={transition.isPending}>
                  <Play /> Activate
                </Button>
              )}
              {g.status === 'ACTIVE' && (
                <Button variant="outline" onClick={() => move('pause')} loading={transition.isPending}>
                  <Pause /> Pause goal
                </Button>
              )}
              {g.status === 'PAUSED' && (
                <Button onClick={() => move('resume')} loading={transition.isPending}>
                  <Play /> Resume
                </Button>
              )}
              {(g.status === 'ACTIVE' || g.status === 'PAUSED') && (
                <Button variant="secondary" onClick={() => setConfirm('complete')}>
                  <Check /> Mark achieved
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirm('abandon')}>
                <Archive /> {g.status === 'DRAFT' ? 'Delete' : 'Abandon'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CommitmentList commitments={g.commitments} consistency={consistency} readOnly={g.readOnly} onAdd={() => setEditing('new')} onEdit={setEditing} />
      <NotesCard key={g.id} goal={g} />

      {editing && <CommitmentDialog goalId={g.id} commitment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {editGoal && <EditGoalDialog goal={g} onClose={() => setEditGoal(false)} />}

      <ConfirmDialog
        open={confirm === 'complete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark this goal as achieved?"
        description="Completed goals become read-only (except notes). Its commitments stop generating tasks."
        confirmLabel="Yes, I achieved it"
        loading={transition.isPending}
        onConfirm={() => move('complete')}
      />
      <ConfirmDialog
        open={confirm === 'abandon'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={g.status === 'DRAFT' ? 'Delete this draft?' : 'Abandon this goal?'}
        description="Your history is kept. The goal stops generating tasks and leaves your dashboard."
        confirmLabel={g.status === 'DRAFT' ? 'Delete' : 'Abandon goal'}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, { onSuccess: () => router.push('/app/goals'), onError: (e) => toast({ tone: 'error', message: errorMessage(e) }) })
        }
      />
    </div>
  );
}
