import Link from 'next/link';
import { CheckCircle2, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CheckInResult } from './api';

export function ResultView({ result }: { result: CheckInResult }) {
  const { day, streak, feedback } = result;
  return (
    <div className="grid gap-5" role="status" aria-live="polite">
      <Card>
        <CardContent className="grid gap-4 p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{feedback.headline}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{feedback.detail}</p>
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Completion</dt>
              <dd className="text-lg font-semibold tabular">{day.completionPercentage}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Score</dt>
              <dd className="text-lg font-semibold tabular">{day.dailyScore}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Streak</dt>
              <dd className="flex items-center justify-center gap-1 text-lg font-semibold tabular">
                <Flame className="size-4 text-warning" aria-hidden /> {streak.current}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Button asChild size="lg">
        <Link href="/app/dashboard">Back to today</Link>
      </Button>
    </div>
  );
}
