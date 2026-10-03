'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { InlineAlert } from '@/components/ui/states';
import { errorMessage } from '@/lib/api';
import type { Commitment } from '@/lib/types';
import { useSaveCommitment } from './api';
import { CommitmentEditor } from './commitment-editor';
import { commitmentSchema, emptyCommitment, fromCommitment, toPayload, type CommitmentForm } from './commitment-schema';

/** Add or edit one commitment. Edits apply from today; past days keep their original targets (spec §30). */
export function CommitmentDialog({ goalId, commitment, onClose }: { goalId: string; commitment: Commitment | null; onClose: () => void }) {
  const form = useForm<CommitmentForm>({ resolver: zodResolver(commitmentSchema), defaultValues: commitment ? fromCommitment(commitment) : emptyCommitment() });
  const save = useSaveCommitment(goalId, commitment?.id);
  const [warnings, setWarnings] = useState<string[]>([]);

  const onSubmit = form.handleSubmit((v) =>
    save
      .mutateAsync({ ...toPayload(v), preferredTime: v.preferredTime || (commitment ? null : undefined) })
      .then((res) => (res.warnings?.length ? setWarnings(res.warnings) : onClose()))
      .catch(() => undefined),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={commitment ? 'Edit commitment' : 'Add commitment'} description={commitment ? 'Changes apply from today onward. Past days keep their original targets.' : undefined}>
        {warnings.length > 0 ? (
          <div className="grid gap-3">
            {warnings.map((w) => (
              <InlineAlert key={w} tone="warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </InlineAlert>
            ))}
            <Button onClick={onClose}>Got it</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <CommitmentEditor prefix="" idPrefix="edit" control={form.control} register={form.register} watch={form.watch} errors={form.formState.errors} />
            {save.isError && <InlineAlert>{errorMessage(save.error)}</InlineAlert>}
            <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
              Save
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
