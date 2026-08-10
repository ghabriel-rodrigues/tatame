/**
 * Event banner gradient catalog (spec 008). Banners are design-system
 * gradient presets resolved from the API's `bannerPreset` slug — no image
 * upload in v1 (recorded debt). New presets are catalog entries here, not
 * schema migrations. Colors come from the resolved theme so white-label
 * academies re-brand event banners transitively.
 */

import type { Theme } from '../theme/theme.ts';

/** The purple→pink event gradient — the API's default slug. */
export const EVENT_GRADIENT_DEFAULT = 'event-purple-pink';

type GradientResolver = (theme: Theme) => [string, string];

const CATALOG: Record<string, GradientResolver> = {
  'event-purple-pink': (theme) => [theme.color.brand['2'], theme.color.brand.accent],
  'event-blue-teal': (theme) => [theme.color.info['500'], theme.color.success['500']],
};

/**
 * Resolves a banner preset slug to its [start, end] gradient pair.
 * Unknown slugs fall back to the default preset — a client never renders
 * a blank banner because the catalog lags the server.
 */
export function eventGradientColors(theme: Theme, slug?: string | null): [string, string] {
  const resolver = CATALOG[slug ?? EVENT_GRADIENT_DEFAULT] ?? CATALOG[EVENT_GRADIENT_DEFAULT]!;
  return resolver(theme);
}
