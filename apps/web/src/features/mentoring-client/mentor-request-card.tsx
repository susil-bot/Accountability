'use client';
import Link from 'next/link';
import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import type { MyMentor } from '@/lib/mentoring';
import { useAnswerMentorRequest } from './api';

/** Consent: nothing is shared with a mentor until the client accepts here. */
export function MentorRequestCard({ mentor }: { mentor: MyMentor }) {
  const answer = useAnswerMentorRequest();
  const toast = useToast();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const a = mentor.assignment;
  if (!a || a.status !== 'PENDING') return null;
  const first = a.mentor.name.split(' ')[0];

  const respond = (v: 'accept' | 'decline') =>
    answer.mutate(v, {
      onSuccess: () => toast({ tone: 'success', message: v === 'accept' ? `${first} is now your mentor` : 'Request declined' }),
      onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
      onSettled: () => setConfirmDecline(false),
    });

  return (
    <Card className="border-primary/40 bg-secondary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="size-5 text-primary" aria-hidden /> {a.mentor.name} would like to be your mentor
        </CardTitle>
        <CardDescription>
          {first} will be able to see your progress, check-ins, reflections and evidence, and can send you reminders. You can stop sharing at any time in Settings. Nothing is
          shared until you accept.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {a.mentor.bio && <p className="w-full text-sm text-muted-foreground">“{a.mentor.bio}”</p>}
        <Button loading={answer.isPending && answer.variables === 'accept'} onClick={() => respond('accept')}>
          Accept
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/goals?chooseMentor=1">Choose someone else</Link>
        </Button>
        <Button variant="ghost" onClick={() => setConfirmDecline(true)}>
          Decline
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirmDecline}
        onOpenChange={setConfirmDecline}
        title={`Decline ${first} as your mentor?`}
        description="The admin will be told and may suggest someone else."
        confirmLabel="Decline"
        tone="danger"
        loading={answer.isPending}
        onConfirm={() => respond('decline')}
      />
    </Card>
  );
}
