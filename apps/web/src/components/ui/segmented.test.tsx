import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Segmented } from './segmented';

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState<string | undefined>('b');
  return (
    <Segmented
      label="Status"
      value={v}
      onChange={(x) => {
        setV(x);
        onChange?.(x);
      }}
      options={[
        { value: 'a', label: 'Done' },
        { value: 'b', label: 'Partly' },
        { value: 'c', label: 'Missed' },
      ]}
    />
  );
}

describe('Segmented (WAI-ARIA radio group)', () => {
  it('exposes a labelled radiogroup with one checked radio', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Partly' })).toHaveAttribute('aria-checked', 'true');
  });

  it('has a single tab stop on the selected option', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: 'Partly' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Done' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection with arrow keys and wraps around', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('radio', { name: 'Partly' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Missed' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Done' })).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });
});
