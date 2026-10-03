'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import type { GoalDetail } from '@/lib/types';
import { useUpdateGoal } from './api';

const schema = z.object({ notes: z.string().max(5000, 'Notes are limited to 5,000 characters') });

/** Notes stay editable even when a goal is completed (spec §7). */
export function NotesCard({ goal }: { goal: GoalDetail }) {
  const toast = useToast();
  const update = useUpdateGoal(goal.id);
  const { register, handleSubmit, formState, reset } = useForm<{ notes: string }>({ resolver: zodResolver(schema), defaultValues: { notes: goal.notes ?? '' } });
  const onSubmit = handleSubmit((v) =>
    update
      .mutateAsync({ notes: v.notes })
      .then(() => {
        reset(v);
        toast({ tone: 'success', message: 'Notes saved' });
      })
      .catch((e) => toast({ tone: 'error', message: errorMessage(e) })),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <Textarea aria-label="Goal notes" rows={3} placeholder="Lessons, adjustments, context…" {...register('notes')} />
          {formState.errors.notes && (
            <p role="alert" className="text-xs font-medium text-danger">
              {formState.errors.notes.message}
            </p>
          )}
          <Button type="submit" variant="outline" className="justify-self-start" loading={formState.isSubmitting} disabled={!formState.isDirty}>
            Save notes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
