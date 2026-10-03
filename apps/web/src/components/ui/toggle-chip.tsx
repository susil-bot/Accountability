'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A pressable chip for multi-select sets (weekdays, blockers, categories).
 * One component instead of hand-rolled class strings on every screen.
 */
export interface ToggleChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  shape?: 'pill' | 'tile';
  emphasis?: 'soft' | 'solid';
}

export const ToggleChip = React.forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ pressed, onPressedChange, shape = 'tile', emphasis = 'soft', className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'border text-sm font-medium transition-colors',
        shape === 'pill' ? 'h-10 rounded-full px-4' : 'min-h-11 rounded-lg px-3',
        pressed
          ? emphasis === 'solid'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-primary bg-secondary text-secondary-foreground'
          : 'border-input bg-card hover:bg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
ToggleChip.displayName = 'ToggleChip';

/** Toggle membership of `item` in a list, preserving order of first insertion. */
export function toggleIn<T>(list: T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? list : [...list, item]) : list.filter((x) => x !== item);
}
