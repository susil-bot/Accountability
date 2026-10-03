import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleChip, toggleIn } from './toggle-chip';

describe('ToggleChip', () => {
  it('reflects state with aria-pressed and toggles on click', async () => {
    const onPressedChange = vi.fn();
    render(
      <ToggleChip pressed={false} onPressedChange={onPressedChange}>
        Mon
      </ToggleChip>,
    );
    const btn = screen.getByRole('button', { name: 'Mon' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it('toggleIn adds once and removes', () => {
    expect(toggleIn([1, 2], 3, true)).toEqual([1, 2, 3]);
    expect(toggleIn([1, 2], 2, true)).toEqual([1, 2]);
    expect(toggleIn([1, 2], 1, false)).toEqual([2]);
  });
});
