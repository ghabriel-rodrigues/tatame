/**
 * Custom style-dictionary v4 formats for the four Tatame token targets:
 *   - tatame/css          -> build/web/tokens.css   (Lumira CSS custom properties)
 *   - tatame/ts-web       -> build/web/tokens.ts    (typed constants + web css strings)
 *   - tatame/ts-native    -> build/native/tokens.ts (RN module, unitless, no web composites)
 *   - tatame/kotlin       -> build/kotlin/LumiraTokens.kt  (Compose object)
 *   - tatame/swift        -> build/swift/LumiraTokens.swift (Swift enum + SwiftUI Color)
 */

import {
  walkTokens,
  darkValue,
  cssVarName,
  aliasPath,
  parseColor,
  px,
  ms,
  kotlinColor,
  swiftColor,
  camel,
  pascal,
  cssPx,
  cssShadowLayer,
} from './helpers.mjs';

const GENERATED_BANNER = (lang) =>
  ({
    css: `/* GENERATED FILE — do not edit. Source: tokens/tokens.json (design-system:tokens). */\n\n`,
    ts: `/* GENERATED FILE — do not edit. Source: tokens/tokens.json (design-system:tokens). */\n/* eslint-disable */\n\n`,
    kotlin: `// GENERATED FILE — do not edit. Source: tokens/tokens.json (design-system:tokens).\n\n`,
    swift: `// GENERATED FILE — do not edit. Source: tokens/tokens.json (design-system:tokens).\n\n`,
  })[lang];

function isTrackingPath(path) {
  return path[0] === 'text' && path[1] === 'tracking';
}

function quoteFontFamily(name) {
  return /\s/.test(name) || name === 'Quicksand' ? `'${name}'` : name;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

function cssValue(path, token, raw) {
  const type = token.$type;
  const value = raw ?? token.$value;

  if (path[0] === 'focus') {
    // Lumira: 0 0 0 3px color-mix(in oklab, var(--purple-500) 40%, transparent)
    const orig = token.original?.$value ?? value;
    const ref = aliasPath(orig.color);
    const colorExpr = ref
      ? `color-mix(in oklab, var(${cssVarName(ref)}) ${orig.alpha * 100}%, transparent)`
      : orig.color;
    return `${cssPx(px(value.offsetX))} ${cssPx(px(value.offsetY))} ${cssPx(px(value.blur))} ${cssPx(px(value.spread))} ${colorExpr}`;
  }

  switch (type) {
    case 'color': {
      const ref = aliasPath(token.original?.$value);
      // Dark overrides (raw !== undefined) are always literals.
      if (ref && raw === undefined) return `var(${cssVarName(ref)})`;
      return value;
    }
    case 'dimension':
      return cssPx(px(value));
    case 'fontFamily':
      return value.map(quoteFontFamily).join(', ');
    case 'fontWeight':
      return String(value);
    case 'number':
      if (isTrackingPath(path)) return value === 0 ? '0' : `${value}em`;
      if (path[0] === 'glass' && path[1] === 'saturation') return `${value * 100}%`;
      return String(value);
    case 'shadow':
      return value.map(cssShadowLayer).join(', ');
    case 'gradient': {
      const stops = value.stops
        .map((s) => `${s.color} ${s.position * 100}%`)
        .join(', ');
      return `linear-gradient(${value.angle}deg, ${stops})`;
    }
    case 'cubicBezier':
      return `cubic-bezier(${value.join(', ')})`;
    case 'duration':
      return value;
    default:
      return String(value);
  }
}

export function formatCss({ dictionary }) {
  const light = [];
  const dark = [];
  for (const { path, token } of walkTokens(dictionary.tokens)) {
    const name = cssVarName(path);
    light.push(`  ${name}: ${cssValue(path, token)};`);
    const dv = darkValue(token);
    if (dv !== undefined) dark.push(`  ${name}: ${cssValue(path, token, dv)};`);
  }
  return (
    GENERATED_BANNER('css') +
    `:root {\n${light.join('\n')}\n}\n\n` +
    `[data-theme="dark"] {\n${dark.join('\n')}\n}\n`
  );
}

/* ------------------------------------------------------------------ */
/* TypeScript (web + native share the value mapping)                   */
/* ------------------------------------------------------------------ */

function tsValue(path, token, raw) {
  const value = raw ?? token.$value;
  if (path[0] === 'focus') {
    return {
      offsetX: px(value.offsetX),
      offsetY: px(value.offsetY),
      blur: px(value.blur),
      spread: px(value.spread),
      alpha: value.alpha,
      color: value.color,
    };
  }
  switch (token.$type) {
    case 'color':
      return value;
    case 'dimension':
      return px(value);
    case 'fontFamily':
    case 'fontWeight':
    case 'number':
    case 'cubicBezier':
      return value;
    case 'duration':
      return ms(value);
    case 'shadow':
      return value.map((l) => ({
        offsetX: px(l.offsetX),
        offsetY: px(l.offsetY),
        blur: px(l.blur),
        spread: px(l.spread),
        color: l.color,
        inset: !!l.inset,
      }));
    case 'gradient':
      return value;
    default:
      return value;
  }
}

function insert(tree, path, value) {
  let node = tree;
  for (const seg of path.slice(0, -1)) {
    const key = camel(seg);
    node[key] ??= {};
    node = node[key];
  }
  node[camel(path.at(-1))] = value;
}

function buildTrees(dictionary) {
  const tokens = {};
  const dark = {};
  for (const { path, token } of walkTokens(dictionary.tokens)) {
    insert(tokens, path, tsValue(path, token));
    const dv = darkValue(token);
    if (dv !== undefined) insert(dark, path, tsValue(path, token, dv));
  }
  return { tokens, dark };
}

function tsModule({ tokens, dark }, { native }) {
  const lines = [GENERATED_BANNER('ts')];
  lines.push(
    native
      ? `/**\n * Lumira tokens for React Native. All dimensions are unitless px numbers;\n * durations are ms; \`text.tracking\` values are em — multiply by fontSize for\n * RN \`letterSpacing\` (px). Web-only composite strings are omitted; shadows and\n * glass ship as raw ingredients per the ds-01 degradation policy.\n */`
      : `/**\n * Lumira tokens for web. \`tokens\` mirrors tokens.json with resolved values\n * (dimensions as px numbers); \`darkTokens\` is the partial dark overlay;\n * \`webCss\` carries ready-made CSS composite strings; \`cssVars\` maps token\n * paths to the Lumira CSS custom property names.\n */`,
  );
  lines.push('');
  lines.push(`export const tokens = ${JSON.stringify(tokens, null, 2)} as const;`);
  lines.push('');
  lines.push(
    `/** Dark-mode overrides (partial mirror of \`tokens\`) — applyTema() remix + default-brand dark tints. */`,
  );
  lines.push(`export const darkTokens = ${JSON.stringify(dark, null, 2)} as const;`);
  lines.push('');
  lines.push(`export type Tokens = typeof tokens;`);
  lines.push(`export type DarkTokens = typeof darkTokens;`);
  lines.push('');
  return lines.join('\n');
}

export function formatTsWeb({ dictionary }) {
  const trees = buildTrees(dictionary);
  let out = tsModule(trees, { native: false });

  const cssVars = {};
  const shadowCss = {};
  let glassShine = '';
  let glassShadow = '';
  let focusRing = '';
  for (const { path, token } of walkTokens(dictionary.tokens)) {
    cssVars[path.join('.')] = cssVarName(path);
    if (path[0] === 'shadow') shadowCss[camel(path[1])] = cssValue(path, token);
    if (path[0] === 'glass' && path[1] === 'shine') glassShine = cssValue(path, token);
    if (path[0] === 'glass' && path[1] === 'shadow') glassShadow = cssValue(path, token);
    if (path[0] === 'focus') focusRing = cssValue(path, token);
  }
  out += `\n/** Ready-made CSS composite strings (web only). */\n`;
  out += `export const webCss = ${JSON.stringify(
    { shadow: shadowCss, glass: { shine: glassShine, shadow: glassShadow }, focusRing },
    null,
    2,
  )} as const;\n`;
  out += `\n/** Token path -> Lumira CSS custom property name. */\n`;
  out += `export const cssVars = ${JSON.stringify(cssVars, null, 2)} as const;\n`;
  return out;
}

export function formatTsNative({ dictionary }) {
  return tsModule(buildTrees(dictionary), { native: true });
}

/* ------------------------------------------------------------------ */
/* Kotlin (Compose)                                                    */
/* ------------------------------------------------------------------ */

function kotlinName(path) {
  const [head, ...rest] = path;
  if (head === 'color') {
    if (rest[0] === 'ink') return `Ink${pascal(rest[1])}`;
    if (rest[0] === 'white') return 'White';
    return rest.map(pascal).join('');
  }
  return rest.map(pascal).join('');
}

export function formatKotlin({ dictionary }) {
  const colors = [];
  const darkColors = [];
  const space = [];
  const radius = [];
  const fontSize = [];
  const fontWeight = [];
  const lineHeight = [];
  const tracking = [];
  const motion = [];
  const shadow = [];
  const glass = [];
  let focus = { spread: 3, alpha: 0.4, color: '#8B3DEB' };

  const doc = (token) => (token.$description ? ` // ${token.$description}` : '');

  for (const { path, token } of walkTokens(dictionary.tokens)) {
    const dv = darkValue(token);
    if (path[0] === 'color') {
      const name = kotlinName(path);
      colors.push(`        val ${name} = ${kotlinColor(token.$value)}${doc(token)}`);
      if (dv !== undefined) darkColors.push(`        val ${name} = ${kotlinColor(dv)}`);
    } else if (path[0] === 'space') {
      space.push(`        val S${path[1]} = ${px(token.$value)}.dp`);
    } else if (path[0] === 'radius') {
      const name = path[1] === '2xl' ? 'Xxl' : pascal(path[1]);
      radius.push(`        val ${name} = ${px(token.$value)}.dp`);
    } else if (path[0] === 'text' && path[1] === 'size') {
      fontSize.push(`        val Text${pascal(path[2])} = ${px(token.$value)}.sp`);
    } else if (path[0] === 'font' && path[1] === 'weight') {
      fontWeight.push(`        val ${pascal(path[2])} = FontWeight(${token.$value})`);
    } else if (path[0] === 'text' && path[1] === 'line-height') {
      lineHeight.push(`        val ${pascal(path[2])} = ${token.$value}f`);
    } else if (path[0] === 'text' && path[1] === 'tracking') {
      tracking.push(`        val ${pascal(path[2])} = ${token.$value}f // em`);
    } else if (path[0] === 'motion') {
      if (path[1] === 'duration') {
        motion.push(`        val Dur${pascal(path[2])} = ${ms(token.$value)} // ms`);
      } else {
        const [a, b, c, d] = token.$value;
        motion.push(`        val Ease${pascal(path[2])} = CubicBezierEasing(${a}f, ${b}f, ${c}f, ${d}f)`);
      }
    } else if (path[0] === 'shadow') {
      const layer = token.$value[0];
      const name = pascal(path[1]);
      shadow.push(
        `        val Elevation${name} = ${Math.max(1, px(layer.offsetY))}.dp // approximation of ${cssShadowLayer(layer)}`,
      );
      shadow.push(`        val Color${name} = ${kotlinColor(layer.color)}`);
    } else if (path[0] === 'glass') {
      const name = pascal(path[1]);
      if (token.$type === 'color') {
        glass.push(`        val ${name} = ${kotlinColor(token.$value)}`);
        if (dv !== undefined) darkColors.push(`        val Glass${name} = ${kotlinColor(dv)}`);
      } else if (token.$type === 'dimension') {
        glass.push(`        val ${name} = ${px(token.$value)}.dp`);
      } else if (path[1] === 'saturation') {
        glass.push(`        val Saturation = ${token.$value}f`);
      } else if (path[1] === 'shine') {
        const v = token.$value;
        glass.push(`        val ShineAngle = ${v.angle}f`);
        glass.push(
          `        val ShineColors = listOf(${v.stops.map((s) => kotlinColor(s.color)).join(', ')})`,
        );
        glass.push(`        val ShineStops = listOf(${v.stops.map((s) => `${s.position}f`).join(', ')})`);
      }
      // glass.shadow: composite assembly is platform-owned (ds-01); not exported to Compose.
    } else if (path[0] === 'focus') {
      const v = token.$value;
      focus = { spread: px(v.spread), alpha: v.alpha, color: v.color };
    }
  }

  return (
    GENERATED_BANNER('kotlin') +
    `package com.tatame.designsystem.tokens

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Lumira design tokens for Compose. Static defaults (light); [DarkColors] is
 * the partial dark overlay (applyTema remix + default-brand dark tints).
 * White-label overlays come from DerivePalette.kt at theme-construction time.
 * Tracking values are em multipliers; shadow elevations approximate the
 * purple-tinted web shadows per the ds-01 degradation policy.
 */
object LumiraTokens {
    object Colors {
${colors.join('\n')}
    }

    /** Dark-mode overrides — same names as [Colors] (plus Glass* colors). */
    object DarkColors {
${darkColors.join('\n')}
    }

    object Space {
${space.join('\n')}
    }

    object Radius {
${radius.join('\n')}
    }

    object FontSize {
${fontSize.join('\n')}
    }

    object FontWeights {
${fontWeight.join('\n')}
    }

    object LineHeight {
${lineHeight.join('\n')}
    }

    object Tracking {
${tracking.join('\n')}
    }

    object Motion {
${motion.join('\n')}
    }

    object Shadow {
${shadow.join('\n')}
    }

    object Glass {
${glass.join('\n')}
    }

    object FocusRing {
        val Width = ${focus.spread}.dp
        const val Alpha = ${focus.alpha}f
        val RingColor = ${kotlinColor(focus.color)}
    }
}
`
  );
}

/* ------------------------------------------------------------------ */
/* Swift (SwiftUI)                                                     */
/* ------------------------------------------------------------------ */

function swiftName(path) {
  const [head, ...rest] = path;
  let name;
  if (head === 'color') {
    if (rest[0] === 'ink') name = `ink${pascal(rest[1])}`;
    else if (rest[0] === 'white') name = 'white';
    else name = camel(rest[0]) + rest.slice(1).map(pascal).join('');
  } else {
    name = camel(rest[0]) + rest.slice(1).map(pascal).join('');
  }
  // Identifiers cannot start with a digit (e.g. fg "1", space "0").
  return /^\d/.test(name) ? `n${name}` : name;
}

const SWIFT_WEIGHTS = { 300: '.light', 400: '.regular', 500: '.medium', 600: '.semibold', 700: '.bold' };

export function formatSwift({ dictionary }) {
  const colors = [];
  const darkColors = [];
  const space = [];
  const radius = [];
  const fontSize = [];
  const fontWeight = [];
  const lineHeight = [];
  const tracking = [];
  const motion = [];
  const shadow = [];
  const glass = [];
  let focus = { spread: 3, alpha: 0.4, color: '#8B3DEB' };

  for (const { path, token } of walkTokens(dictionary.tokens)) {
    const dv = darkValue(token);
    if (path[0] === 'color') {
      const name = swiftName(path);
      colors.push(`        public static let ${name} = ${swiftColor(token.$value)}`);
      if (dv !== undefined) darkColors.push(`        public static let ${name} = ${swiftColor(dv)}`);
    } else if (path[0] === 'space') {
      space.push(`        public static let s${path[1]}: CGFloat = ${px(token.$value)}`);
    } else if (path[0] === 'radius') {
      const name = path[1] === '2xl' ? 'xxl' : camel(path[1]);
      radius.push(`        public static let ${name}: CGFloat = ${px(token.$value)}`);
    } else if (path[0] === 'text' && path[1] === 'size') {
      fontSize.push(`        public static let text${pascal(path[2])}: CGFloat = ${px(token.$value)}`);
    } else if (path[0] === 'font' && path[1] === 'weight') {
      fontWeight.push(
        `        public static let ${camel(path[2])}: Font.Weight = ${SWIFT_WEIGHTS[token.$value]}`,
      );
    } else if (path[0] === 'text' && path[1] === 'line-height') {
      lineHeight.push(`        public static let ${camel(path[2])}: CGFloat = ${token.$value}`);
    } else if (path[0] === 'text' && path[1] === 'tracking') {
      tracking.push(`        public static let ${camel(path[2])}: CGFloat = ${token.$value} // em`);
    } else if (path[0] === 'motion') {
      if (path[1] === 'duration') {
        motion.push(
          `        public static let dur${pascal(path[2])}: TimeInterval = ${ms(token.$value) / 1000}`,
        );
      } else {
        const [a, b, c, d] = token.$value;
        motion.push(
          `        public static let ease${pascal(path[2])}: (Double, Double, Double, Double) = (${a}, ${b}, ${c}, ${d})`,
        );
      }
    } else if (path[0] === 'shadow') {
      const layers = token.$value;
      const name = camel(path[1]);
      const lits = layers
        .map(
          (l) =>
            `LumiraShadow(color: ${swiftColor(l.color)}, x: ${px(l.offsetX)}, y: ${px(l.offsetY)}, blur: ${px(l.blur)}, spread: ${px(l.spread)}, inset: ${l.inset ? 'true' : 'false'})`,
        )
        .join(', ');
      shadow.push(`        public static let ${name}: [LumiraShadow] = [${lits}]`);
    } else if (path[0] === 'glass') {
      const name = camel(path[1]);
      if (token.$type === 'color') {
        glass.push(`        public static let ${name} = ${swiftColor(token.$value)}`);
        if (dv !== undefined)
          darkColors.push(`        public static let glass${pascal(path[1])} = ${swiftColor(dv)}`);
      } else if (token.$type === 'dimension') {
        glass.push(`        public static let ${name}: CGFloat = ${px(token.$value)}`);
      } else if (path[1] === 'saturation') {
        glass.push(`        public static let saturation: CGFloat = ${token.$value}`);
      } else if (path[1] === 'shine') {
        const v = token.$value;
        glass.push(`        public static let shineAngle: CGFloat = ${v.angle}`);
        glass.push(
          `        public static let shineColors: [Color] = [${v.stops.map((s) => swiftColor(s.color)).join(', ')}]`,
        );
        glass.push(
          `        public static let shineStops: [CGFloat] = [${v.stops.map((s) => s.position).join(', ')}]`,
        );
      } else if (path[1] === 'shadow') {
        const lits = token.$value
          .map(
            (l) =>
              `LumiraShadow(color: ${swiftColor(l.color)}, x: ${px(l.offsetX)}, y: ${px(l.offsetY)}, blur: ${px(l.blur)}, spread: ${px(l.spread)}, inset: ${l.inset ? 'true' : 'false'})`,
          )
          .join(', ');
        glass.push(`        public static let shadow: [LumiraShadow] = [${lits}]`);
      }
    } else if (path[0] === 'focus') {
      const v = token.$value;
      focus = { spread: px(v.spread), alpha: v.alpha, color: v.color };
    }
  }

  return (
    GENERATED_BANNER('swift') +
    `import SwiftUI

public extension Color {
    /// 0xAARRGGBB initializer for generated Lumira tokens.
    init(lumiraHex hex: UInt64) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: Double((hex >> 24) & 0xFF) / 255
        )
    }
}

/// One layer of a purple-tinted Lumira shadow (maps to SwiftUI .shadow —
/// radius ≈ blur / 2 — per the ds-01 degradation policy).
public struct LumiraShadow: Sendable {
    public let color: Color
    public let x: CGFloat
    public let y: CGFloat
    public let blur: CGFloat
    public let spread: CGFloat
    public let inset: Bool
}

/**
 Lumira design tokens for SwiftUI. Static defaults (light); \`DarkColors\` is the
 partial dark overlay (applyTema remix + default-brand dark tints). White-label
 overlays come from DerivePalette.swift at theme-construction time. Tracking
 values are em multipliers.
 */
public enum LumiraTokens {
    public enum Colors {
${colors.join('\n')}
    }

    /// Dark-mode overrides — same names as \`Colors\` (plus glass* colors).
    public enum DarkColors {
${darkColors.join('\n')}
    }

    public enum Space {
${space.join('\n')}
    }

    public enum Radius {
${radius.join('\n')}
    }

    public enum FontSize {
${fontSize.join('\n')}
    }

    public enum FontWeights {
${fontWeight.join('\n')}
    }

    public enum LineHeight {
${lineHeight.join('\n')}
    }

    public enum Tracking {
${tracking.join('\n')}
    }

    public enum Motion {
${motion.join('\n')}
    }

    public enum Shadows {
${shadow.join('\n')}
    }

    public enum Glass {
${glass.join('\n')}
    }

    public enum FocusRing {
        public static let width: CGFloat = ${focus.spread}
        public static let alpha: CGFloat = ${focus.alpha}
        public static let ringColor = ${swiftColor(focus.color)}
    }
}
`
  );
}
