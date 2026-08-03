/**
 * Chip — P1 primitive (ds-05). Compact pill for status badges (Ativo /
 * Pendente / Lotada) and selectable filters (weekday chips, professor pick).
 *
 * Anatomy: [root: pill] > [label 11-12/700]
 * Variants (`tone`): `neutral` (bg-app wash) | `brand` (brand-tint / solid
 *           when selected) | `success` | `warning` | `danger` (status-100 bg
 *           + status-500 text pairs)
 * Sizes: `sm` (badge, 11px) | `md` (tappable filter, 12.5px)
 * States: static (no `onPress`) / pressable (button, `aria-pressed`) /
 *         selected (solid brand fill, white label) / disabled
 * Tokens: radius.pill, success/warning/danger 100+500, brand-tint,
 *         purple-950 (selected fill), motion fast.
 *
 * Cross-platform prop vocabulary: `label`, `tone`, `size`, `selected`,
 * `disabled`, `onPress` (mapped to `onClick` on web).
 */

import type { MouseEventHandler } from 'react';
import { styled, type Theme } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  size?: ChipSize;
  /** Solid brand fill + white label (weekday picked, filter active). */
  selected?: boolean;
  disabled?: boolean;
  /** Presence makes the chip a real button (`aria-pressed` = `selected`). */
  onPress?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

const TONE_STYLES: Record<ChipTone, { background: string; color: string }> = {
  neutral: { background: 'var(--bg-app)', color: 'var(--fg-3)' },
  brand: { background: 'var(--brand-tint)', color: 'var(--brand-1)' },
  success: { background: 'var(--success-100)', color: 'var(--success-500)' },
  warning: { background: 'var(--warning-100)', color: 'var(--warning-500)' },
  danger: { background: 'var(--danger-100)', color: 'var(--danger-500)' },
};

const chipStyles = ({ theme }: { theme: Theme }) => {
  const v = theme.vars ?? theme;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.pill,
    border: '1px solid transparent',
    fontWeight: tokens.font.weight.bold,
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    transition: `background ${tokens.motion.duration.fast}ms, color ${tokens.motion.duration.fast}ms`,
    '&.Chip-sm': { fontSize: '11px', padding: '4px 10px' },
    '&.Chip-md': { fontSize: '12.5px', padding: '7px 14px' },
    ...Object.fromEntries(
      (Object.keys(TONE_STYLES) as ChipTone[]).map((tone) => [
        `&.Chip-${tone}`,
        TONE_STYLES[tone],
      ]),
    ),
    '&.Chip-pressable': { cursor: 'pointer', border: '1px solid var(--border-1)' },
    '&.Chip-selected': {
      background: v.palette.primary.main,
      color: v.palette.primary.contrastText,
      borderColor: 'transparent',
    },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  } as const;
};

const RootBadge = styled('span')(chipStyles);
const RootButton = styled('button')(chipStyles);

export function Chip({
  label,
  tone = 'neutral',
  size = 'sm',
  selected = false,
  disabled = false,
  onPress,
  className,
}: ChipProps) {
  const classes = [
    'Chip-root',
    `Chip-${tone}`,
    `Chip-${size}`,
    onPress ? 'Chip-pressable' : null,
    selected ? 'Chip-selected' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onPress) {
    return (
      <RootButton
        type="button"
        className={classes}
        onClick={onPress}
        disabled={disabled}
        aria-pressed={selected}
      >
        {label}
      </RootButton>
    );
  }
  return <RootBadge className={classes}>{label}</RootBadge>;
}

export default Chip;
