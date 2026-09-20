/**
 * Shared helpers for the Tatame token build (tokens/build.mjs).
 * Pure functions: token-tree walking, Lumira CSS var naming, value parsing,
 * and per-platform color/number formatting.
 */

export const DARK_EXT = 'com.tatame';

/** Walk the resolved DTCG token tree, yielding { path, token } leaves. */
export function* walkTokens(node, path = []) {
  if (node === null || typeof node !== 'object') return;
  if ('$value' in node) {
    yield { path, token: node };
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    yield* walkTokens(child, [...path, key]);
  }
}

/** Dark-mode override raw value for a token, or undefined. */
export function darkValue(token) {
  return token.$extensions?.[DARK_EXT]?.dark;
}

/** Map a token path to its Lumira CSS custom property name. */
export function cssVarName(path) {
  const [head, ...rest] = path;
  switch (head) {
    case 'color': {
      const [group, ...r] = rest;
      if (group === 'ink') return `--${r[0]}-ink`;
      if (group === 'white') return '--white';
      return `--${[group, ...r].join('-')}`;
    }
    case 'focus':
      return '--focus-ring';
    case 'font':
      return rest[0] === 'family' ? `--font-${rest[1]}` : `--weight-${rest[1]}`;
    case 'text': {
      const [group, name] = rest;
      if (group === 'size') return `--text-${name}`;
      if (group === 'line-height') return `--lh-${name}`;
      return `--tracking-${name}`;
    }
    case 'space':
      return `--space-${rest[0]}`;
    case 'radius':
      return `--radius-${rest[0]}`;
    case 'shadow':
      return `--shadow-${rest[0]}`;
    case 'glass':
      return `--glass-${rest.join('-')}`;
    case 'motion':
      return rest[0] === 'ease' ? `--ease-${rest[1]}` : `--dur-${rest[1]}`;
    default:
      return `--${path.join('-')}`;
  }
}

/** "{color.purple.700}" -> ["color","purple","700"] or null. */
export function aliasPath(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^\{([^}]+)\}$/);
  return m ? m[1].split('.') : null;
}

/** Parse "#RRGGBB(AA)" or "rgba(r, g, b, a)" -> { r, g, b, a } (0-255, a 0-1). */
export function parseColor(str) {
  const hex = str.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return {
      r: (int >> 16) & 0xff,
      g: (int >> 8) & 0xff,
      b: int & 0xff,
      a: hex[2] ? parseInt(hex[2], 16) / 255 : 1,
    };
  }
  const rgba = str.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgba) {
    return {
      r: +rgba[1],
      g: +rgba[2],
      b: +rgba[3],
      a: rgba[4] === undefined ? 1 : +rgba[4],
    };
  }
  throw new Error(`token build: cannot parse color "${str}"`);
}

/** Number of px from "16px" / "0" / 16. */
export function px(value) {
  if (typeof value === 'number') return value;
  return parseFloat(value);
}

/** Milliseconds from "120ms". */
export function ms(value) {
  if (typeof value === 'number') return value;
  return parseFloat(value);
}

/** Compose Color(0xAARRGGBB) literal. */
export function kotlinColor(str) {
  const { r, g, b, a } = parseColor(str);
  const bytes = [Math.round(a * 255), r, g, b]
    .map((n) => n.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `Color(0x${bytes})`;
}

/** SwiftUI Color literal via the generated hex initializer. */
export function swiftColor(str) {
  const { r, g, b, a } = parseColor(str);
  const bytes = [Math.round(a * 255), r, g, b]
    .map((n) => n.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `Color(lumiraHex: 0x${bytes})`;
}

/** "on-color" -> "onColor", "2xs" -> "2xs" (kept, callers quote), "bg-deep" -> "bgDeep". */
export function camel(segment) {
  return segment.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** PascalCase identifier safe for Kotlin/Swift ("2xs" -> "Size2xs" handled by callers). */
export function pascal(segment) {
  const c = camel(segment);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Format a px number the Lumira way: 0 has no unit. */
export function cssPx(n) {
  return n === 0 ? '0' : `${n}px`;
}

/** One CSS box-shadow layer from a structured shadow entry. */
export function cssShadowLayer(layer) {
  const parts = [];
  if (layer.inset) parts.push('inset');
  parts.push(
    cssPx(px(layer.offsetX)),
    cssPx(px(layer.offsetY)),
    cssPx(px(layer.blur)),
  );
  if (px(layer.spread) !== 0) parts.push(cssPx(px(layer.spread)));
  parts.push(layer.color);
  return parts.join(' ');
}
