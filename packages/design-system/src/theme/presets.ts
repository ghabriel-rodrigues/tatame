/**
 * Ready-made white-label palettes (ds-03).
 *
 * Values are extracted verbatim from the Admin prototype's palette picker
 * (`App Jiu-Jitsu - Admin.dc.html:851` — PALETAS Lumira/Oceano/Mata/Ouro) and
 * match the Aluno prototype's `brandPalette.options`.
 */

import type { BrandInput } from './derive-palette.ts';

export type PresetKey = 'roxo' | 'navy' | 'verde' | 'preto';

/** Default Tatame brand — the static Lumira purple baseline. */
export const TATAME_DEFAULT_BRAND: BrandInput = {
  deep: '#4F2389',
  vibrant: '#8B3DEB',
  accent: '#EC5BAE',
};

export const READY_MADE_PALETTES: Record<PresetKey, BrandInput> = {
  /** "Lumira" — default purple. */
  roxo: TATAME_DEFAULT_BRAND,
  /** "Oceano" — navy / red. */
  navy: { deep: '#14213D', vibrant: '#3A5FA8', accent: '#E63946' },
  /** "Mata" — green / gold. */
  verde: { deep: '#1B4332', vibrant: '#2D6A4F', accent: '#E8A33D' },
  /** "Ouro" — black / gold. */
  preto: { deep: '#1F1F23', vibrant: '#4A4A52', accent: '#D4A017' },
};

/** Display names as shown in the Admin identity screen (pt-BR handoff). */
export const PRESET_DISPLAY_NAMES: Record<PresetKey, string> = {
  roxo: 'Lumira',
  navy: 'Oceano',
  verde: 'Mata',
  preto: 'Ouro',
};
