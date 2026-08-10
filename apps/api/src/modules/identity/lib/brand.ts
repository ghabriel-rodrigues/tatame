/**
 * White-label brand plumbing (spec 011). The DB stores the triplet as three
 * uppercase `#RRGGBB` columns (all-or-none CHECK); payloads keep the historic
 * `theme` field name but now carry this typed shape.
 */

/** The cross-platform 3-color brand input (`BrandInput` contract). */
export interface BrandTheme {
  deep: string;
  vibrant: string;
  accent: string;
}

/** API-side hex validation — any case in, uppercase into the DB. */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Case normalization: the DB CHECK accepts uppercase only. */
export const normalizeHex = (hex: string): string => hex.toUpperCase();

/**
 * Assembles the payload `theme` from the three columns. The all-or-none CHECK
 * guarantees the trio is complete whenever `deep` is set.
 */
export function themeFromColumns(
  deep: string | null,
  vibrant: string | null,
  accent: string | null,
): BrandTheme | null {
  if (deep == null || vibrant == null || accent == null) return null;
  return { deep, vibrant, accent };
}
