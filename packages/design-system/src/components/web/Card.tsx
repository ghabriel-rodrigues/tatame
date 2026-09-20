/**
 * Card — P0 primitive (ds-05). Base content surface for every persona.
 *
 * Anatomy: [root: rounded surface (radius-lg 20)] > children
 * Variants:
 *   - `surface` — solid `--bg-surface`, shadow-sm (default)
 *   - `hero`    — immersive brand gradient (brand-1 -> brand-2), white text,
 *                 shadow-md (Aluno home header, admin revenue hero)
 *   - `tinted`  — `--brand-tint` wash (info panels, "link de convite" note)
 *   - `glass`   — `glassSurface('regular')`; floating surfaces only, never
 *                 nested inside another glass surface
 * Tokens: radius.lg, shadow.sm/md, bg-surface, brand-1/2, brand-tint,
 *         glass.* (via mixin).
 */

import type { ReactNode } from 'react';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import { tokens, webCss } from '../../../build/web/tokens.ts';
import { glassSurface } from '../../theme/glass.ts';

export type CardVariant = 'surface' | 'hero' | 'tinted' | 'glass';

export interface CardProps {
  variant?: CardVariant;
  children?: ReactNode;
  /** Inner padding in px (defaults to space-5 = 20). */
  padding?: number;
  className?: string;
}

const Root = styled(Paper)(({ theme }) => {
  const v = theme.vars ?? theme;
  return {
    borderRadius: tokens.radius.lg,
    boxShadow: webCss.shadow.sm,
    overflow: 'hidden',
    '&.Card-hero': {
      background: `linear-gradient(150deg, ${v.palette.primary.main}, ${v.palette.primary.light} 80%)`,
      color: v.palette.primary.contrastText,
      boxShadow: webCss.shadow.md,
    },
    '&.Card-tinted': {
      background: 'var(--brand-tint)',
      boxShadow: 'none',
    },
    '&.Card-glass': glassSurface('regular'),
  };
});

export function Card({
  variant = 'surface',
  children,
  padding = tokens.space[5],
  className,
}: CardProps) {
  const classes = ['Card-root', `Card-${variant}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <Root className={classes} elevation={0} sx={{ padding: `${padding}px` }}>
      {children}
    </Root>
  );
}

export default Card;
