'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarClock, ListChecks, MessageCircle, ShieldCheck, UserRoundSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { CATEGORIES, formatDate } from '@/lib/format';
import { CHANNEL_LABEL, firstName, formatDateTime } from '@/lib/mentoring';
import { useAnswerMentorRequest, useMyMentor } from './api';
import { Avatar, MentorPicker } from './mentor-picker';

const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

/**
 * "Your mentor" on the Goals page: get a mentor (no mentor), answer an admin's suggestion (pending),
 * or see who is following your progress and change mentor (active). `?chooseMentor=1` opens the picker.
 */
export function MentorPanel() {
  const q = useMyMentor();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const answer = useAnswerMentorRequest();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (params.get('chooseMentor') === '1') {
      setOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [params, router, pathname]);

  if (q.isPending) return <Skeleton className="h-36" />;
  if (q.isError) return null; // the goals list still works; the bell and Today page surface mentor news
  const a = q.data.assignment;

  return (
    <section aria-labelledby="mentor-panel-h">
      <h2 id="mentor-panel-h" className="sr-only">
        Your mentor
      </h2>
      {!a ? (
        <Card className="overflow-hidden">
          <CardContent className="grid gap-4 pt-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <UserRoundSearch className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">Get a mentor to keep you on track</p>
                <ul className="mt-1 grid gap-0.5 text-sm text-muted-foreground">
                  <li>Follows your daily progress and spots slips early</li>
                  <li>Sends reminders and books calls with you</li>
                  <li>Shares a short summary and next steps after each call</li>
                </ul>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden /> You choose who sees your progress, and can stop sharing any time.
                </p>
              </div>
            </div>
            <Button size="lg" onClick={() => setOpen(true)}>
              Choose a mentor
            </Button>
          </CardContent>
        </Card>
      ) : a.status === 'PENDING' ? (
        <Card className="border-primary/40">
          <CardContent className="grid gap-4 pt-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex gap-4">
              <Avatar name={a.mentor.name} />
              <div>
                <p className="font-semibold">Your admin suggested {a.mentor.name}</p>
                {a.mentor.headline && <p className="text-sm text-muted-foreground">{a.mentor.headline}</p>}
                <p className="mt-1 text-sm text-muted-foreground">Accept to start sharing your progress, or pick someone else.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={answer.isPending}
                onClick={() =>
                  answer.mutate('accept', {
                    onSuccess: () => toast({ tone: 'success', message: `${firstName(a.mentor.name)} is now your mentor` }),
                    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
                  })
                }
              >
                Accept
              </Button>
              <Button variant="outline" onClick={() => setOpen(true)}>
                Choose someone else
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-[1fr_auto] md:items-start">
            <div className="flex gap-4">
              <Avatar name={a.mentor.name} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{a.mentor.name}</p>
                  <Badge tone="success">Your mentor</Badge>
                </div>
                {a.mentor.headline && <p className="text-sm text-muted-foreground">{a.mentor.headline}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  Following your progress since {formatDate(a.since.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}
                  {a.mentor.focusAreas.length > 0 && ` · ${a.mentor.focusAreas.map(categoryLabel).join(', ')}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-4 text-primary" aria-hidden />
                    {a.nextSession ? `Next call ${formatDateTime(a.nextSession.startsAt)} · ${CHANNEL_LABEL[a.nextSession.channel]}` : 'No call booked yet'}
                  </span>
                  <Link href="/app/dashboard#from-mentor" className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                    <ListChecks className="size-4 text-primary" aria-hidden />
                    {a.openActions ? `${a.openActions} open action item${a.openActions === 1 ? '' : 's'}` : 'No open action items'}
                  </Link>
                  <Link href="/app/dashboard#from-mentor" className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                    <MessageCircle className="size-4 text-primary" aria-hidden /> Messages and summaries
                  </Link>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button variant="outline" onClick={() => setOpen(true)}>
                Change mentor
              </Button>
              <Button asChild variant="ghost">
                <Link href="/app/settings#mentor">Sharing settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <MentorPicker open={open} onOpenChange={setOpen} current={a} />
    </section>
  );
}
