import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Occurrence } from '@/lib/types';
import { TaskRow } from './task-row';

const base: Occurrence = {
  id: 'o1',
  taskId: 't',
  commitmentId: 'c',
  goalId: 'g',
  title: 'Read docs',
  period: 'DAY',
  scheduledDate: '2026-10-02',
  scheduledStartTime: '2026-10-02T03:30:00.000Z',
  scheduledEndTime: '2026-10-02T18:29:59.999Z',
  preferredTime: null,
  status: 'PENDING',
  targetValue: 1,
  targetUnit: 'BOOLEAN',
  unitLabel: null,
  actualValue: null,
  completionPercentage: 0,
  requiresEvidence: true,
  evidenceCount: 0,
  completedAt: null,
  completedLate: false,
  missedAt: null,
  editable: true,
  dayOpen: true,
};

describe('TaskRow', () => {
  it('offers one-tap completion for a pending task', async () => {
    const onQuickComplete = vi.fn();
    render(<TaskRow occ={base} timeZone="UTC" pending={false} onQuickComplete={onQuickComplete} onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark “Read docs” as done' }));
    expect(onQuickComplete).toHaveBeenCalledOnce();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('opens the editor instead for completed tasks', async () => {
    const onOpen = vi.fn();
    render(<TaskRow occ={{ ...base, status: 'COMPLETED', actualValue: 1 }} timeZone="UTC" pending={false} onQuickComplete={vi.fn()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Read docs: Completed. Edit' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('disables input while a save is in flight (no fake "Completed")', () => {
    render(<TaskRow occ={base} timeZone="UTC" pending onQuickComplete={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mark “Read docs” as done' })).toBeDisabled();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });
});
