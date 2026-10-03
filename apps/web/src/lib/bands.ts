import type { Band } from './types';

/** Calendar/consistency colour bands (spec §33). Shared by the week strip, calendar and insights. */
export const BAND_CLASS: Record<Band, string> = {
  GREEN: 'bg-band-green',
  AMBER: 'bg-band-amber',
  RED: 'bg-band-red',
  NONE: 'bg-band-none',
  REST: 'bg-band-none',
  FUTURE: 'bg-transparent border border-dashed border-input',
};

export const BAND_CSS_VAR: Record<Band, string> = {
  GREEN: 'var(--band-green)',
  AMBER: 'var(--band-amber)',
  RED: 'var(--band-red)',
  NONE: 'var(--band-none)',
  REST: 'var(--band-none)',
  FUTURE: 'var(--band-none)',
};

export function bandLabel(band: Band, completion: number): string {
  if (band === 'FUTURE') return 'upcoming';
  if (band === 'REST') return 'rest day';
  if (band === 'NONE') return 'no activity';
  return `${completion}% complete`;
}
