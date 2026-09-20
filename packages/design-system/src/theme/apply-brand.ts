/**
 * Web white-label integration (ds-03): writes a derived palette onto the
 * Lumira CSS custom properties as plain hex — no color-mix() strings in
 * production. The same DerivedPalette object feeds createTatameTheme() so the
 * MUI variable layer and the Lumira variable layer always agree.
 */

import type { DerivedPalette } from './derive-palette.ts';

/** Minimal structural type so this module typechecks without the DOM lib. */
export interface CssVarTarget {
  style: { setProperty(name: string, value: string): void };
}

/**
 * Write the derived brand hex values onto CSS custom properties.
 * Recipe token names map 1:1 to Lumira var names (`purple-700` -> `--purple-700`,
 * `purple-ink` -> `--purple-ink`).
 *
 * Defaults to `document.documentElement`; pass `target` explicitly in
 * non-browser environments (tests, SSR shells).
 */
export function applyBrand(
  derived: DerivedPalette,
  target?: CssVarTarget,
): void {
  const el =
    target ??
    (globalThis as { document?: { documentElement: CssVarTarget } }).document
      ?.documentElement;
  if (!el) {
    throw new Error(
      'applyBrand: no document available — pass an explicit CssVarTarget.',
    );
  }
  for (const [token, hex] of Object.entries(derived)) {
    el.style.setProperty(`--${token}`, hex);
  }
}
