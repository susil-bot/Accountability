import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Goal } from '@/lib/types';

export function GoalCard({ goal }: { goal: Goal }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active goal</p>
            <Link href={`/app/goals/detail?id=${goal.id}`} className="mt-1 block font-semibold underline-offset-4 hover:underline">
              {goal.title}
            </Link>
            {goal.successMeasure && <p className="text-sm text-muted-foreground">Success: {goal.successMeasure}</p>}
          </div>
          {goal.daysRemaining !== null && (
            <Badge tone={goal.daysRemaining < 0 ? 'warning' : 'primary'}>
              {goal.daysRemaining >= 0 ? `${goal.daysRemaining} days left` : `${-goal.daysRemaining} days past target`}
            </Badge>
          )}
        </div>
        {goal.progress.type === 'NUMERIC' ? (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular">
                {goal.progress.current} / {goal.progress.target} ({goal.progress.percentage}%)
              </span>
            </div>
            <Progress value={goal.progress.percentage ?? 0} label="Goal progress" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Progress: {goal.progress.completed ? 'Completed' : 'Not completed yet'} — you’ll confirm completion yourself.</p>
        )}
      </CardContent>
    </Card>
  );
}
