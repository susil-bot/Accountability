import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Dashboard } from '@/lib/types';

/** Missed-day recovery (spec §65–66): calm, factual, and points to yesterday — never auto-carries tasks. */
export function RecoveryCard({ yesterday, streak }: Pick<Dashboard, 'yesterday' | 'streak'>) {
  const showYesterday = yesterday && !yesterday.isSuccessful;
  if (!showYesterday && !streak.broken) return null;
  return (
    <Card className="bg-secondary/60">
      <CardContent className="grid gap-2 p-5 text-sm">
        {showYesterday && (
          <div>
            <p className="font-medium">
              Yesterday: {yesterday.completedCount} of {yesterday.plannedCount} completed{yesterday.checkInStatus === 'MISSED' ? ', check-in missed' : ''}.
            </p>
            {yesterday.missed.length > 0 && (
              <p className="mt-0.5 text-muted-foreground">
                {yesterday.missed.some((m) => m.status === 'MISSED') ? 'You missed: ' : 'Partly done: '}
                {yesterday.missed.map((m) => m.title).join(', ')}
              </p>
            )}
          </div>
        )}
        {streak.broken && <p className="text-muted-foreground">Previous streak: {streak.previous} days. Today’s goal: start a new streak.</p>}
        {yesterday && (
          <Link href={`/app/calendar?date=${yesterday.date}`} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            Review yesterday <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
