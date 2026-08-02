/**
 * Color helpers for the RN entry. Kept separate from `src/theme/glass.ts`
 * (which imports web tokens) so the Metro graph never pulls web modules
 * (rn-03 separation guarantee).
 */

/** Uppercase-hex `#RRGGBB` (or `#RGB`) -> `rgba(r, g, b, alpha)`. */
export function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((ch) => ch + ch).join('') : n;
  const int = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) {
    throw new Error(`hexToRgba: invalid hex color "${hex}"`);
  }
  return `rgba(${(int >> 16) & 0xff}, ${(int >> 8) & 0xff}, ${int & 0xff}, ${alpha})`;
}
