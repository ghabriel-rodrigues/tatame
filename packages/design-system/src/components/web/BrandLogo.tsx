/**
 * BrandLogo — P0 primitive (ds-05). The Tatame belt mark, drawn with
 * primitives (never an image), frozen at: white bar + dark tip + 2 white
 * stripes (same drawing routine the BeltBar family uses). Swappable for a
 * real academy logo later (asset pipeline is ticket 09, out of scope).
 *
 * Anatomy: [badge? (squircle, brand-1 bg + glow)] > [belt bar (white,
 *          rounded)] > [tip (purple-950)] > [stripe x2 (white)]
 * Variants: `boxed` (squircle badge — login screens, default) | `bare`
 *          (belt only — splash over gradient)
 * Sizes: `sm` | `md` | `lg` (login squircle = md 56px; splash belt = lg)
 * Tokens: brand-1, purple-950, white, shadow-glow, radius (scaled).
 * A11y: role="img" with an accessible label (default "Tatame").
 */

import { styled } from '@mui/material/styles';
import { glowShadow } from '../../theme/glass.ts';

export type BrandLogoSize = 'sm' | 'md' | 'lg';

export interface BrandLogoProps {
  size?: BrandLogoSize;
  /** `boxed` wraps the belt in the brand squircle badge. */
  boxed?: boolean;
  /** Accessible name; defaults to the product mark. */
  label?: string;
  className?: string;
}

interface Metrics {
  badge: number;
  badgeRadius: number;
  beltW: number;
  beltH: number;
  beltRadius: number;
  tipW: number;
  tipRight: number;
  stripeW: number;
  stripeGap: number;
}

/** Geometry from the handoff prototypes (login 56px squircle, splash belt). */
const METRICS: Record<BrandLogoSize, Metrics> = {
  sm: {
    badge: 40,
    badgeRadius: 13,
    beltW: 24,
    beltH: 7,
    beltRadius: 2,
    tipW: 8,
    tipRight: 4,
    stripeW: 1.5,
    stripeGap: 1.5,
  },
  md: {
    badge: 56,
    badgeRadius: 18,
    beltW: 32,
    beltH: 9,
    beltRadius: 2.5,
    tipW: 10,
    tipRight: 5,
    stripeW: 2,
    stripeGap: 2,
  },
  lg: {
    badge: 80,
    badgeRadius: 26,
    beltW: 52,
    beltH: 14,
    beltRadius: 4,
    tipW: 16,
    tipRight: 8,
    stripeW: 2.5,
    stripeGap: 2,
  },
};

const Badge = styled('div')(({ theme }) => {
  const v = theme.vars ?? theme;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: v.palette.primary.main,
    boxShadow: glowShadow(),
    flexShrink: 0,
  };
});

const Belt = styled('div')({
  position: 'relative',
  background: 'var(--white, #FFFFFF)',
});

const Tip = styled('span')({
  position: 'absolute',
  top: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--purple-950, #1A0B2E)',
});

const Stripe = styled('span')({
  height: '100%',
  background: 'var(--white, #FFFFFF)',
});

export function BrandLogo({
  size = 'md',
  boxed = true,
  label = 'Tatame',
  className,
}: BrandLogoProps) {
  const m = METRICS[size];
  const classes = [
    'BrandLogo-root',
    `BrandLogo-${size}`,
    boxed ? 'BrandLogo-boxed' : 'BrandLogo-bare',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const belt = (
    <Belt
      className="BrandLogo-belt"
      style={{ width: m.beltW, height: m.beltH, borderRadius: m.beltRadius }}
    >
      <Tip
        className="BrandLogo-tip"
        style={{ right: m.tipRight, width: m.tipW, gap: m.stripeGap }}
      >
        <Stripe className="BrandLogo-stripe" style={{ width: m.stripeW }} />
        <Stripe className="BrandLogo-stripe" style={{ width: m.stripeW }} />
      </Tip>
    </Belt>
  );

  if (!boxed) {
    return (
      <span
        role="img"
        aria-label={label}
        className={classes}
        style={{ display: 'inline-flex' }}
      >
        {belt}
      </span>
    );
  }

  return (
    <Badge
      role="img"
      aria-label={label}
      className={classes}
      style={{ width: m.badge, height: m.badge, borderRadius: m.badgeRadius }}
    >
      {belt}
    </Badge>
  );
}

export default BrandLogo;
