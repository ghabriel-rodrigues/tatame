/**
 * Store product gradient catalog (spec 009). Product tiles are letter
 * monograms over design-system gradient presets resolved from the API's
 * `gradientPreset` slug — no image upload in v1 (recorded debt). Same
 * mechanism as the events banner catalog (event-gradients.ts): new presets
 * are catalog entries here, not schema migrations, and colors come from the
 * resolved theme so white-label academies re-brand product tiles
 * transitively.
 *
 * The detail screen's 3 "fotos" are deterministic catalog-neighbor variants
 * of the product's own preset (`storeGalleryPresets`) — the "Foto N de 3"
 * gallery is derivation, not schema (spec 009 implementation decision).
 */

import type { Theme } from '../theme/theme.ts';

/** The blue→purple store gradient — the API's default slug. */
export const STORE_GRADIENT_DEFAULT = 'store-blue-purple';

type GradientResolver = (theme: Theme) => [string, string];

/** Ordered catalog — the order drives the gallery-neighbor derivation. */
const SLUGS = [
  'store-blue-purple',
  'store-teal-green',
  'store-orange-red',
  'store-pink-purple',
] as const;

const CATALOG: Record<(typeof SLUGS)[number], GradientResolver> = {
  'store-blue-purple': (theme) => [theme.color.info['500'], theme.color.brand['2']],
  'store-teal-green': (theme) => [theme.color.info['500'], theme.color.success['500']],
  'store-orange-red': (theme) => [theme.color.warning['500'], theme.color.danger['500']],
  'store-pink-purple': (theme) => [theme.color.brand.accent, theme.color.brand['2']],
};

/** The catalog's slug list, in derivation order. */
export const STORE_GRADIENT_PRESETS: readonly string[] = SLUGS;

/**
 * Resolves a product preset slug to its [start, end] gradient pair.
 * Unknown slugs fall back to the default preset — a client never renders a
 * blank tile because the catalog lags the server.
 */
export function storeGradientColors(theme: Theme, slug?: string | null): [string, string] {
  const resolver =
    CATALOG[(slug ?? STORE_GRADIENT_DEFAULT) as (typeof SLUGS)[number]] ??
    CATALOG[STORE_GRADIENT_DEFAULT];
  return resolver(theme);
}

/**
 * The product's 3 deterministic gallery presets: its own slug plus the next
 * 2 catalog neighbors (wrap-around). Client-side derivation of the
 * prototype's "Foto N de 3" — stable for a given preset, no server input.
 */
export function storeGalleryPresets(slug?: string | null): [string, string, string] {
  const base = SLUGS.indexOf((slug ?? STORE_GRADIENT_DEFAULT) as (typeof SLUGS)[number]);
  const start = base === -1 ? 0 : base;
  return [
    SLUGS[start % SLUGS.length]!,
    SLUGS[(start + 1) % SLUGS.length]!,
    SLUGS[(start + 2) % SLUGS.length]!,
  ];
}
