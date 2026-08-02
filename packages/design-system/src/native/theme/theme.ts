/**
 * RN theme resolution (rn-03 / DS.7).
 *
 * `createTheme()` resolves the active token tree: static Lumira tokens
 * (light) -> optional dark overlay (`darkTokens`) -> optional white-label
 * overlay from the canonical `derivePalette()` executor. Components never
 * read the generated token modules directly — they consume the resolved
 * `Theme` via `useTheme()` (ThemeProvider.tsx).
 *
 * White-label overlay: the derived entries ("purple-700", "pink-ink", ...)
 * are written onto the purple/pink/ink scales, then every semantic alias that
 * points at a brand hue (fg, brand.*, border.strong, focus ring, glow, glass
 * stroke) is re-pointed at the updated scale — mirroring how the web's
 * `applyBrand()` + semantic CSS vars re-brand transitively.
 */

import { tokens, darkTokens } from '../../../build/native/tokens.ts';
import {
  derivePalette,
  type BrandInput,
  type Mode,
} from '../../theme/derive-palette.ts';
import { hexToRgba } from '../lib/color.ts';

/** Deeply widen `as const` literals to plain string/number structures. */
type DeepWiden<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? DeepWiden<U>[]
        : { -readonly [K in keyof T]: DeepWiden<T[K]> };

export type ThemeTokens = DeepWiden<typeof tokens>;

export interface Theme extends ThemeTokens {
  mode: Mode;
  /** Active white-label brand; `null` = static Lumira defaults. */
  brand: BrandInput | null;
}

export interface CreateThemeOptions {
  /** Academy 3-color brand input; omit for the default Tatame brand. */
  brand?: BrandInput | null;
  /** Light for now (DS.7); dark set + dark derivation are already wired. */
  mode?: Mode;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value as unknown;
    }
  }
}

/** "purple-700" -> color.purple["700"]; "pink-ink" -> color.ink.pink. */
function overlayDerived(t: ThemeTokens, derived: Record<string, string>): void {
  for (const [token, hex] of Object.entries(derived)) {
    const [scale, step] = token.split('-') as [string, string];
    if (step === 'ink') {
      t.color.ink[scale as 'purple' | 'pink'] = hex;
    } else if (scale === 'purple' || scale === 'pink') {
      const bucket = t.color[scale] as Record<string, string>;
      if (step in bucket) bucket[step] = hex;
    }
  }
}

export function createTheme(options: CreateThemeOptions = {}): Theme {
  const mode: Mode = options.mode ?? 'light';
  const brand = options.brand ?? null;

  const t = deepClone(tokens) as unknown as ThemeTokens;
  if (mode === 'dark') {
    deepMerge(t as unknown as Record<string, unknown>, darkTokens as unknown as Record<string, unknown>);
  }

  if (brand) {
    overlayDerived(t, derivePalette(brand, mode));

    // Re-point semantic aliases at the (re-branded) scales.
    const purple = t.color.purple;
    const pink = t.color.pink;
    if (mode === 'light') {
      // Dark fg comes from the static dark set, not the brand scale.
      t.color.fg['1'] = purple['950'];
      t.color.fg['2'] = purple['800'];
    }
    t.color.brand['1'] = purple['700'];
    t.color.brand['2'] = purple['500'];
    t.color.brand.accent = pink['500'];
    t.color.brand.tint = purple['50'];
    t.color.border.strong = purple['700'];
    t.focus.ring.color = purple['500'];
    t.glass.stroke = hexToRgba(purple['500'], 0.18);
    const glow = t.shadow.glow[0];
    if (glow) glow.color = hexToRgba(purple['500'], 0.35);
  }

  return Object.assign(t, { mode, brand }) as Theme;
}
