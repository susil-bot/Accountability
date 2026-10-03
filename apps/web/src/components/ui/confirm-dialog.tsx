'use client';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';

/** Standard confirmation for consequential actions (complete, abandon, archive). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div className="grid gap-2">
          <Button size="lg" variant={tone === 'danger' ? 'danger' : 'default'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
