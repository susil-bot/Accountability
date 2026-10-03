'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { InlineAlert } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import type { GoalDetail } from '@/lib/types';
import { useUpdateGoal } from './api';

const schema = z.object({
  title: z.string().trim().min(3, 'Describe your goal in a few words').max(140),
  motivation: z.string().max(2000),
  successMeasure: z.string().max(500),
  targetDate: z.string(),
});
type Values = z.infer<typeof schema>;

export function EditGoalDialog({ goal, onClose }: { goal: GoalDetail; onClose: () => void }) {
  const update = useUpdateGoal(goal.id);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: goal.title, motivation: goal.motivation ?? '', successMeasure: goal.successMeasure ?? '', targetDate: goal.targetDate ?? '' },
  });
  const err = formState.errors;
  const onSubmit = handleSubmit((v) =>
    update.mutateAsync({ title: v.title, motivation: v.motivation, successMeasure: v.successMeasure, targetDate: v.targetDate || null }).then(onClose).catch(() => undefined),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit goal">
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <Field id="g-title" label="Goal" error={err.title?.message}>
            <Input id="g-title" aria-invalid={!!err.title} {...register('title')} />
          </Field>
          <Field id="g-why" label="Why it matters">
            <Textarea id="g-why" rows={3} {...register('motivation')} />
          </Field>
          <Field id="g-measure" label="Success measure">
            <Input id="g-measure" {...register('successMeasure')} />
          </Field>
          <Field id="g-date" label="Target date">
            <Input id="g-date" type="date" {...register('targetDate')} />
          </Field>
          {update.isError && <InlineAlert>{errorMessage(update.error)}</InlineAlert>}
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
