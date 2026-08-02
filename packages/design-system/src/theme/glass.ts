/**
 * Glass surface mixins (ds-02 §6) — THE single glass definition on web.
 *
 * `glassSurface()` returns a plain CSS-in-JS object consuming the Lumira CSS
 * custom properties (`--glass-*` from build/web/tokens.css), so glass follows
 * white-label re-brands and dark-mode `[data-theme]` flips for free.
 *
 * Usage rule (enforced by component specs): glass only on floating
 * interactive surfaces — tab bar, sheets, toasts, switch thumbs — never
 * glass-on-glass. Content inside a glass sheet uses solid `--bg-surface`.
 *
 * - `regular` — blur 20 (`--glass-blur`): toasts, switch thumbs.
 * - `deep`    — blur 24 (`--glass-blur-strong`), deeper tint
 *               (`--glass-bg-deep`): sheets, dialogs, tab bar.
 */

import { tokens } from '../../build/web/tokens.ts';

export type GlassVariant = 'regular' | 'deep';

/** CSS-in-JS object shape (Emotion/MUI `sx`/`styled` compatible). */
export type CssMixin = Record<string, string | number | Record<string, string | number>>;

export function glassSurface(variant: GlassVariant = 'regular'): CssMixin {
  const background = variant === 'deep' ? 'var(--glass-bg-deep)' : 'var(--glass-bg)';
  const blur = variant === 'deep' ? 'var(--glass-blur-strong)' : 'var(--glass-blur)';
  const filter = `blur(${blur}) saturate(var(--glass-saturation))`;
  return {
    position: 'relative',
    background,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-shadow)',
    // Shine overlay — painted under the surface's children, over its bg.
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      background: 'var(--glass-shine)',
      pointerEvents: 'none',
    },
  };
}

/** Uppercase-hex `#RRGGBB` -> `rgba(r, g, b, alpha)`. */
export function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((ch) => ch + ch).join('') : n;
  const int = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) {
    throw new Error(`hexToRgba: invalid hex color "${hex}"`);
  }
  return `rgba(${(int >> 16) & 0xff}, ${(int >> 8) & 0xff}, ${int & 0xff}, ${alpha})`;
}

/**
 * Named glow mixin (ds-02 §4): NOT part of the 25-slot shadow array — applied
 * only by the primary-CTA override and brand-badge surfaces. Structure comes
 * from the `shadow.glow` token; color follows the brand's vibrant (purple-500
 * slot) so tenant CTAs glow in their own brand.
 */
export function glowShadow(vibrantHex: string = tokens.color.purple[500]): string {
  const [g] = tokens.shadow.glow;
  // Reuse the token's own opacity (rgba alpha) so only the hue is re-branded.
  const alpha = Number(/([0-9.]+)\)\s*$/.exec(g.color)?.[1] ?? 0.35);
  const px = (n: number): string => (n === 0 ? '0' : `${n}px`);
  return `${px(g.offsetX)} ${px(g.offsetY)} ${px(g.blur)} ${hexToRgba(vibrantHex, alpha)}`;
}
