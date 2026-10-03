import Link from 'next/link';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CheckInView } from '@/lib/types';

export function CheckInCard({ checkIn, timeZone, highlight }: { checkIn: CheckInView; timeZone: string; highlight: boolean }) {
  const done = checkIn.status === 'COMPLETED' || checkIn.status === 'LATE';
  const when = formatTime(checkIn.scheduledAt, timeZone);
  return (
    <Card className={cn(!done && highlight && 'border-primary/40')}>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {done ? <CheckCircle2 className="mt-0.5 size-5 text-success" aria-hidden /> : <CalendarClock className="mt-0.5 size-5 text-primary" aria-hidden />}
          <div>
            <h2 className="font-medium">{done ? 'Today’s check-in is complete' : 'Daily check-in'}</h2>
            <p className="text-sm text-muted-foreground">
              {done
                ? `Recorded${checkIn.status === 'LATE' ? ' (late)' : ''}. You can update it until midnight.`
                : checkIn.window === 'BEFORE_REMINDER'
                  ? `Scheduled for ${when}. You can check in any time today.`
                  : 'Your check-in is ready — it takes about two minutes.'}
            </p>
          </div>
        </div>
        <Button asChild variant={done ? 'outline' : 'default'} size="lg" className="sm:shrink-0">
          <Link href="/app/check-in">{done ? 'Review check-in' : 'Complete today’s check-in'}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
