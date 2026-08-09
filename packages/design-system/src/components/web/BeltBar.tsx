/**
 * BeltBar — graduation primitive (GRD.12, resolved belt-tokenization ticket).
 * The drawn jiu-jitsu belt, rendered with primitives (never images) and keyed
 * by data: components receive `colorSlug`/`tipColorSlug`/`degrees`/
 * `maxDegrees` from the API's BeltDef-shaped payload and never switch on
 * belt names — future arts are catalog rows, zero component changes.
 *
 * Anatomy: [root: rounded bar, fill = color.belt[colorSlug], inset
 *          belt.outline hairline] > [ponteira: solid block at the right end,
 *          ~22% of bar width, fill = tipColorSlug ?? belt.tip] > [stripe xN:
 *          vertical belt.stripe white stripes ON the ponteira, count =
 *          current degrees (clamped to maxDegrees)]
 * Rules:  black belt ships `tipColorSlug: 'belt.red'` — red ponteira with
 *          white dan stripes (IBJJF). Red belt has `maxDegrees: 0` — solid
 *          bar, no degree stripes in v1. The `belt.outline` hairline is what
 *          keeps the white belt visible on any surface — never "fix" it with
 *          a gray fill. Unknown `colorSlug` falls back to gray with a logged
 *          warning (defensive default for catalog-ahead-of-client skews).
 * Sizes:  `sm` (list rows) | `md` (cards) | `lg` (hero). Height fixed per
 *          size, width defaults per size (override via className).
 * Tokens: color.belt.* only — belts are static, brand-independent, exempt
 *          from white-label derivation and dark remix.
 * A11y:   role="img" labeled by `name` (pt-BR display data from the DB).
 *
 * `BeltChip` is the compact variant: sm bar + pt-BR label in a pill
 * ("Faixa azul · 2 graus") for registry rows and range displays.
 * `BrandLogo` is this anatomy's prior art, frozen at white + 2 stripes.
 */

import { styled } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export type BeltBarSize = 'sm' | 'md' | 'lg';

export interface BeltBarProps {
  /** Design-token slug from the API — `belt.blue` (or bare `blue`). */
  colorSlug: string;
  /** Ponteira override slug; null/undefined = default `belt.tip`. */
  tipColorSlug?: string | null;
  /** Current degrees — rendered as white stripes on the ponteira. */
  degrees?: number;
  /** Belt maximum (stripe clamp); 0 = no stripes ever (red belt in v1). */
  maxDegrees?: number;
  size?: BeltBarSize;
  /** Accessible name (pt-BR display data, e.g. "Faixa azul · 2 graus"). */
  name?: string;
  className?: string;
}

const BELT_COLOR_VARS: Record<string, string> = {
  white: 'var(--belt-white)',
  gray: 'var(--belt-gray)',
  yellow: 'var(--belt-yellow)',
  orange: 'var(--belt-orange)',
  green: 'var(--belt-green)',
  blue: 'var(--belt-blue)',
  purple: 'var(--belt-purple)',
  brown: 'var(--belt-brown)',
  black: 'var(--belt-black)',
  red: 'var(--belt-red)',
};

interface Metrics {
  width: number;
  height: number;
  radius: number;
  tipInset: number;
  stripeW: number;
  stripeGap: number;
}

/** Geometry scaled from the BrandLogo prior art (handoff prototypes). */
const METRICS: Record<BeltBarSize, Metrics> = {
  sm: { width: 44, height: 10, radius: 3, tipInset: 2, stripeW: 1.5, stripeGap: 1.5 },
  md: { width: 72, height: 16, radius: 4, tipInset: 3, stripeW: 2, stripeGap: 2.5 },
  lg: { width: 132, height: 26, radius: 6, tipInset: 5, stripeW: 3, stripeGap: 4 },
};

/**
 * `belt.blue` / `blue` → CSS color for the bar. Unknown slugs render gray
 * with a logged warning (keeps old clients alive when the catalog grows).
 */
function beltColor(slug: string): { color: string; fallback: boolean } {
  const key = slug.startsWith('belt.') ? slug.slice('belt.'.length) : slug;
  const color = BELT_COLOR_VARS[key];
  if (color) return { color, fallback: false };
  // eslint-disable-next-line no-console
  console.warn(`[BeltBar] unknown belt colorSlug "${slug}" — rendering gray fallback`);
  return { color: BELT_COLOR_VARS['gray'] as string, fallback: true };
}

const Bar = styled('span')({
  position: 'relative',
  display: 'inline-block',
  overflow: 'hidden',
  flexShrink: 0,
});

const Tip = styled('span')({
  position: 'absolute',
  top: 0,
  bottom: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Ponteira ~22% of the bar width, inset from the rounded right end.
  width: '22%',
});

const Stripe = styled('span')({
  height: '100%',
  background: 'var(--belt-stripe)',
});

export function BeltBar({
  colorSlug,
  tipColorSlug,
  degrees = 0,
  maxDegrees = 4,
  size = 'md',
  name,
  className,
}: BeltBarProps) {
  const m = METRICS[size];
  const bar = beltColor(colorSlug);
  const tip = tipColorSlug ? beltColor(tipColorSlug).color : 'var(--belt-tip)';
  const stripeCount = Math.max(0, Math.min(degrees, maxDegrees));
  const classes = [
    'BeltBar-root',
    `BeltBar-${size}`,
    bar.fallback ? 'BeltBar-fallback' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Bar
      role="img"
      aria-label={name ?? 'Faixa'}
      className={classes}
      style={{
        width: m.width,
        height: m.height,
        borderRadius: m.radius,
        background: bar.color,
        // The inset hairline that saves the white belt on light surfaces.
        boxShadow: 'inset 0 0 0 1px var(--belt-outline)',
      }}
    >
      <Tip
        className="BeltBar-tip"
        style={{ right: m.tipInset, gap: m.stripeGap, background: tip }}
      >
        {Array.from({ length: stripeCount }, (_, index) => (
          <Stripe key={index} className="BeltBar-stripe" style={{ width: m.stripeW }} />
        ))}
      </Tip>
    </Bar>
  );
}

export interface BeltChipProps {
  /** PT-BR belt name from the DB ("Azul"). */
  name: string;
  colorSlug: string;
  tipColorSlug?: string | null;
  degrees?: number;
  maxDegrees?: number;
  /** Overrides the computed "Faixa azul · 2 graus" text. */
  label?: string;
  /** Dimmed presentation (disabled kids belts in régua/válidas displays). */
  dimmed?: boolean;
  className?: string;
}

/** "Faixa azul · 2 graus" (degrees omitted at zero). */
export function beltChipLabel(name: string, degrees = 0): string {
  const base = `Faixa ${name.toLocaleLowerCase('pt-BR')}`;
  if (degrees <= 0) return base;
  return `${base} · ${degrees} ${degrees === 1 ? 'grau' : 'graus'}`;
}

const ChipRoot = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px',
  borderRadius: tokens.radius.pill,
  background: 'var(--bg-app)',
  color: 'var(--fg-2)',
  fontSize: '11px',
  fontWeight: tokens.font.weight.bold,
  whiteSpace: 'nowrap',
  '&.BeltChip-dimmed': { opacity: 0.45 },
});

/** Compact chip variant: sm BeltBar + pt-BR label pill (GRD.12). */
export function BeltChip({
  name,
  colorSlug,
  tipColorSlug,
  degrees = 0,
  maxDegrees = 4,
  label,
  dimmed = false,
  className,
}: BeltChipProps) {
  const text = label ?? beltChipLabel(name, degrees);
  const classes = ['BeltChip-root', dimmed ? 'BeltChip-dimmed' : null, className]
    .filter(Boolean)
    .join(' ');
  return (
    <ChipRoot className={classes}>
      <BeltBar
        colorSlug={colorSlug}
        tipColorSlug={tipColorSlug ?? null}
        degrees={degrees}
        maxDegrees={maxDegrees}
        size="sm"
        name={text}
      />
      <span className="BeltChip-label" aria-hidden>
        {text}
      </span>
    </ChipRoot>
  );
}

export default BeltBar;
