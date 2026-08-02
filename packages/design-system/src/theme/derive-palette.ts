/**
 * Canonical white-label palette derivation (ds-03).
 *
 * Pure, dependency-free TypeScript executor of `tokens/palette-recipe.json`.
 * Mix semantics match CSS `color-mix(in oklab, c1 p%, c2)`: both colors are
 * converted sRGB -> OKLab, linearly interpolated at p (weight of c1), converted
 * back, clamped to sRGB, and emitted as uppercase hex.
 *
 * This is THE single source of derived brand colors on web and React Native.
 * Kotlin (`DerivePalette.kt`) and Swift (`DerivePalette.swift`) carry
 * line-for-line ports of this math, pinned byte-equal by
 * `tokens/palette-fixtures.json`.
 */

import { PALETTE_RECIPE, type RecipeRule } from './palette-recipe.data.ts';

export interface BrandInput {
  /** Primary deep brand color (maps to purple-700). */
  readonly deep: string;
  /** Vibrant brand color (maps to purple-500). */
  readonly vibrant: string;
  /** Accent color (maps to pink-500). */
  readonly accent: string;
}

export type Mode = 'light' | 'dark';

/** Recipe token name (e.g. "purple-700", "pink-ink") -> uppercase hex. */
export type DerivedPalette = Record<string, string>;

/* ------------------------------------------------------------------ */
/* sRGB <-> OKLab (Björn Ottosson's reference constants)               */
/* ------------------------------------------------------------------ */

type Oklab = readonly [l: number, a: number, b: number];

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToOklab(hex: string): Oklab {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((ch) => ch + ch).join('') : n;
  const int = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) {
    throw new Error(`derivePalette: invalid hex color "${hex}"`);
  }
  const r = srgbChannelToLinear(((int >> 16) & 0xff) / 255);
  const g = srgbChannelToLinear(((int >> 8) & 0xff) / 255);
  const b = srgbChannelToLinear((int & 0xff) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToHex(lab: Oklab): string {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map((lin) => {
    const srgb = linearChannelToSrgb(lin);
    const clamped = Math.min(1, Math.max(0, srgb));
    return Math.round(clamped * 255);
  });

  return (
    '#' +
    channels
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * CSS `color-mix(in oklab, c1 pct%, c2)` equivalent.
 * `pct` is the weight of `c1` (0-100).
 */
export function mixOklab(c1: string, pct: number, c2: string): string {
  const w = pct / 100;
  const [l1, a1, b1] = hexToOklab(c1);
  const [l2, a2, b2] = hexToOklab(c2);
  return oklabToHex([
    l1 * w + l2 * (1 - w),
    a1 * w + a2 * (1 - w),
    b1 * w + b2 * (1 - w),
  ]);
}

/* ------------------------------------------------------------------ */
/* Recipe execution                                                    */
/* ------------------------------------------------------------------ */

function normalizeHex(hex: string): string {
  // Normalize any valid input to uppercase #RRGGBB via a round trip-free path.
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((ch) => ch + ch).join('') : n;
  return '#' + full.toUpperCase();
}

function resolveAnchor(
  anchor: string,
  input: BrandInput,
  mode: Mode,
): string {
  if (anchor === 'W') return PALETTE_RECIPE.anchors.W[mode];
  if (anchor === 'deep' || anchor === 'vibrant' || anchor === 'accent') {
    return input[anchor];
  }
  return anchor;
}

function applyRule(rule: RecipeRule, input: BrandInput, mode: Mode): string {
  const base = input[rule.base];
  // Plain copy (anchor null) skips the OKLab round trip entirely so the
  // brand inputs pass through bit-exact (only normalized to #RRGGBB upper).
  if (rule.anchor === null) return normalizeHex(base);
  return mixOklab(base, rule.pct, resolveAnchor(rule.anchor, input, mode));
}

/**
 * Derive the full brand scale (purple-50..950, pink-50..700, purple-ink,
 * pink-ink) from a 3-color academy brand, for the given mode.
 *
 * Neutrals, semantics, belts, and glass are static tokens and are NOT
 * derived — see `tokens/tokens.json`.
 */
export function derivePalette(input: BrandInput, mode: Mode): DerivedPalette {
  const out: DerivedPalette = {};
  for (const entry of PALETTE_RECIPE.entries) {
    const rule: RecipeRule = entry.modes
      ? entry.modes[mode]
      : { base: entry.base!, pct: entry.pct!, anchor: entry.anchor ?? null };
    out[entry.token] = applyRule(rule, input, mode);
  }
  return out;
}
