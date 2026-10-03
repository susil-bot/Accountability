import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { BAND_CLASS, bandLabel } from '@/lib/bands';
import { cn } from '@/lib/utils';
import type { Dashboard } from '@/lib/types';

export function WeekStrip({ week }: Pick<Dashboard, 'week'>) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>This week</CardTitle>
        <Link href="/app/analytics" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Insights
        </Link>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-7 gap-1.5 text-center">
          {week.days.map((day) => (
            <li key={day.date} className="grid justify-items-center gap-1.5">
              <span className={cn('text-[11px] text-muted-foreground', day.isToday && 'font-semibold text-foreground')} aria-hidden>
                {formatDate(day.date, { weekday: 'narrow' })}
              </span>
              <span
                className={cn('size-7 rounded-full', BAND_CLASS[day.band], day.isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-card')}
                role="img"
                aria-label={`${formatDate(day.date)}: ${bandLabel(day.band, day.completion)}`}
                title={`${formatDate(day.date)}: ${bandLabel(day.band, day.completion)}`}
              />
            </li>
          ))}
        </ol>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Completion</dt>
            <dd className="font-semibold tabular">{week.completion === null ? '—' : `${week.completion}%`}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Check-ins</dt>
            <dd className="font-semibold tabular">
              {week.checkIns} / {week.checkInDays}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weekly score</dt>
            <dd className="font-semibold tabular">{week.score ?? '—'}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
