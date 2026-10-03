'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { TaskRow, TaskSheet, useTaskMutation } from '@/features/tasks';
import { FromMentorSection, MentorRequestCard, useMyMentor } from '@/features/mentoring-client';
import type { Occurrence } from '@/lib/types';
import { useDashboard } from './api';
import { TodaySummary } from './today-summary';
import { CheckInCard } from './check-in-card';
import { RecoveryCard } from './recovery-card';
import { WeekStrip } from './week-strip';
import { GoalCard } from './goal-card';

export function DashboardView() {
  const q = useDashboard();
  const mentor = useMyMentor();
  const [openId, setOpenId] = useState<string | null>(null);

  if (q.isPending) return <PageSkeleton label="Loading today" blocks={['h-8 w-56', 'h-40', 'h-24', 'h-16', 'h-16', 'h-16']} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const openOcc = d.today.items.find((i) => i.id === openId) ?? null;

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {d.user.greeting}, {d.user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">{formatDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      {mentor.data && <MentorRequestCard mentor={mentor.data} />}

      {!d.hasAnyGoal ? (
        <EmptyState
          icon={<Target />}
          title="No active goals"
          description="You haven’t created an accountability goal yet. Start with one meaningful goal and two or three small commitments."
          action={
            <Button asChild size="lg">
              <Link href="/app/goals/new">
                <Plus /> Create your first goal
              </Link>
            </Button>
          }
        />
      ) : !d.goal ? (
        <EmptyState
          icon={<Target />}
          title="No active goal right now"
          description="Your goals are paused, completed or in draft. Resume one to get today’s plan."
          action={
            <Button asChild>
              <Link href="/app/goals">View goals</Link>
            </Button>
          }
        />
      ) : (
        <>
          <RecoveryCard yesterday={d.yesterday} streak={d.streak} />
          <TodaySummary today={d.today} streak={d.streak} />
          <CheckInCard checkIn={d.today.checkIn} timeZone={d.user.timezone} highlight={d.nextAction.type === 'CHECK_IN'} />
          <TodayTasks items={d.today.items} isRestDay={d.today.isRestDay} remaining={d.today.remainingCount} timeZone={d.user.timezone} onOpen={setOpenId} />
          {mentor.data && <FromMentorSection mentor={mentor.data} />}
          <WeekStrip week={d.week} />
          <GoalCard goal={d.goal} />
        </>
      )}

      <TaskSheet occ={openOcc} open={!!openOcc} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function TodayTasks({ items, isRestDay, remaining, timeZone, onOpen }: { items: Occurrence[]; isRestDay: boolean; remaining: number; timeZone: string; onOpen: (id: string) => void }) {
  const m = useTaskMutation();
  const pendingId = m.isPending ? m.variables?.occ.id : undefined;
  const dayItems = items.filter((i) => i.period === 'DAY');
  const weekItems = items.filter((i) => i.period === 'WEEK');

  return (
    <section aria-labelledby="today-h" className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="today-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today’s commitments
        </h2>
        {remaining > 0 && <span className="text-xs text-muted-foreground">{remaining} remaining</span>}
      </div>
      {dayItems.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">
          {isRestDay ? 'Rest day — nothing scheduled. Recovery is part of the plan.' : 'Nothing scheduled for today.'}
        </p>
      ) : (
        <ul className="grid gap-2">
          {dayItems.map((o) => (
            <TaskRow key={o.id} occ={o} timeZone={timeZone} pending={pendingId === o.id} onOpen={() => onOpen(o.id)} onQuickComplete={() => m.mutate({ occ: o, kind: 'complete' })} />
          ))}
        </ul>
      )}
      {weekItems.length > 0 && (
        <>
          <h2 className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">This week</h2>
          <ul className="grid gap-2">
            {weekItems.map((o) => (
              <TaskRow key={o.id} occ={o} timeZone={timeZone} pending={pendingId === o.id} onOpen={() => onOpen(o.id)} onQuickComplete={() => onOpen(o.id)} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
