import { Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Dashboard } from '@/lib/types';

export function TodaySummary({ today, streak }: Pick<Dashboard, 'today' | 'streak'>) {
  const pct = today.completionPercentage;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Today’s accountability</h2>
            <p className="mt-1 text-5xl font-semibold tracking-tight tabular" aria-label={`${pct} percent complete`}>
              {pct}
              <span className="text-2xl text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {today.completedCount} / {today.plannedCount} commitments completed
            </p>
          </div>
          <div className="grid justify-items-end gap-2 text-right">
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
              <Flame className="size-4" aria-hidden />
              <span>{streak.current} day streak</span>
            </div>
            <p className="text-xs text-muted-foreground">Best: {streak.longest} days</p>
            <p className="text-xs text-muted-foreground tabular">Score {today.score}</p>
          </div>
        </div>
        <Progress className="mt-4" value={pct} tone={pct >= 80 ? 'success' : 'primary'} label="Today’s completion" />
      </CardContent>
    </Card>
  );
}
