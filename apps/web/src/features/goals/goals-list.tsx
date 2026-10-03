'use client';
import Link from 'next/link';
import { Plus, Target } from 'lucide-react';
import { useGoals } from './api';
import { errorMessage } from '@/lib/api';
import { CATEGORIES, GOAL_STATUS_TONE as STATUS_TONE } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { MentorPanel } from '@/features/mentoring-client';

export function GoalsList() {
  const q = useGoals();
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <Button asChild>
          <Link href="/app/goals/new">
            <Plus /> New goal
          </Link>
        </Button>
      </div>
      <MentorPanel />
      {q.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No goals yet"
          description="You haven’t created an accountability goal yet."
          action={
            <Button asChild>
              <Link href="/app/goals/new">Create your first goal</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {q.data.map((g) => (
            <li key={g.id}>
              <Link href={`/app/goals/detail?id=${g.id}`} className="block rounded-xl border bg-card p-5 hover:border-primary/40">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[g.status]}>{g.status.charAt(0) + g.status.slice(1).toLowerCase()}</Badge>
                  {g.isPrimary && <Badge tone="primary">Primary</Badge>}
                  <span className="text-xs text-muted-foreground">{CATEGORIES.find((c) => c.value === g.category)?.label}</span>
                </div>
                <h2 className="mt-2 font-semibold">{g.title}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {g.commitmentCount ?? 0} commitment{g.commitmentCount === 1 ? '' : 's'}
                  {g.daysRemaining !== null && g.status === 'ACTIVE' && ` · ${g.daysRemaining >= 0 ? `${g.daysRemaining} days left` : 'past target date'}`}
                </p>
                {g.progress.type === 'NUMERIC' && (
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={g.progress.percentage ?? 0} label={`${g.title} progress`} />
                    <span className="shrink-0 text-xs font-medium tabular">
                      {g.progress.current}/{g.progress.target}
                    </span>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
