/**
 * Invariant tests over the generated token outputs (ds-01/ds-04).
 * The full snapshot suite is a follow-up; these lock the seams that other
 * platforms and the BOSS checklist depend on.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens, darkTokens, webCss, cssVars } from '../build/web/tokens.ts';
import { tokens as nativeTokens } from '../build/native/tokens.ts';

const pkgRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p: string) => readFileSync(join(pkgRoot, p), 'utf8');

describe('build/web/tokens.css', () => {
  const css = read('build/web/tokens.css');

  it('keeps the Lumira variable names verbatim (sample across every group)', () => {
    for (const line of [
      '--purple-700: #4F2389;',
      '--pink-500: #EC5BAE;',
      '--gray-950: #0F0B17;',
      '--fg-1: var(--purple-950);',
      '--bg-app: var(--gray-50);',
      '--brand-accent: var(--pink-500);',
      '--border-strong: var(--purple-700);',
      '--focus-ring: 0 0 0 3px color-mix(in oklab, var(--purple-500) 40%, transparent);',
      "--font-display: 'Quicksand', system-ui, -apple-system, 'Segoe UI', sans-serif;",
      '--weight-bold: 700;',
      '--text-2xs: 11px;',
      '--lh-tight: 1.15;',
      '--tracking-tight: -0.02em;',
      '--space-24: 96px;',
      '--radius-pill: 999px;',
      '--shadow-glow: 0 8px 32px rgba(139, 61, 235, 0.35);',
      '--glass-saturation: 180%;',
      '--glass-blur-strong: 24px;',
      '--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);',
      '--dur-slow: 320ms;',
    ]) {
      expect(css).toContain(line);
    }
  });

  it('exposes the ink tokens with a dark block override', () => {
    expect(css).toContain('--purple-ink: var(--purple-700);');
    expect(css).toMatch(/\[data-theme="dark"\] \{[\s\S]*--purple-ink: #B08AF7;/);
    expect(css).toMatch(/\[data-theme="dark"\] \{[\s\S]*--bg-app: #141021;/);
  });

  it('ships the complete belt namespace and never dark-remixes it (ds-04)', () => {
    for (const [name, hex] of Object.entries({
      white: '#EDEAE2',
      gray: '#9A9AA2',
      yellow: '#E8C93D',
      orange: '#E8833D',
      green: '#3D8B4F',
      blue: '#1E5CB3',
      purple: '#6B2DBA',
      brown: '#6B4A2D',
      black: '#17141F',
      red: '#B3261E',
      tip: '#17141F',
      stripe: '#FFFFFF',
    })) {
      expect(css).toContain(`--belt-${name}: ${hex};`);
    }
    expect(css).toContain('--belt-outline: rgba(26, 11, 46, 0.14);');
    const darkBlock = css.split('[data-theme="dark"]')[1]!;
    expect(darkBlock).not.toContain('--belt-');
  });
});

describe('build/web/tokens.ts + build/native/tokens.ts', () => {
  it('belt colors are literals, identical on both platforms', () => {
    expect(tokens.color.belt.blue).toBe('#1E5CB3');
    expect(nativeTokens.color.belt).toEqual(tokens.color.belt);
  });

  it('native module has unitless dimensions and ms durations', () => {
    expect(nativeTokens.space['4']).toBe(16);
    expect(nativeTokens.radius.pill).toBe(999);
    expect(nativeTokens.text.size['2xs']).toBe(11);
    expect(nativeTokens.motion.duration.fast).toBe(120);
    expect(nativeTokens.motion.ease.out).toEqual([0.22, 1, 0.36, 1]);
    expect(nativeTokens.glass.blurStrong).toBe(24);
  });

  it('web module resolves semantic aliases and exposes css composites', () => {
    expect(tokens.color.fg['1']).toBe('#1A0B2E');
    expect(darkTokens.color.bg.app).toBe('#141021');
    expect(webCss.shadow.glow).toBe('0 8px 32px rgba(139, 61, 235, 0.35)');
    expect(webCss.focusRing).toContain('color-mix(in oklab, var(--purple-500) 40%, transparent)');
    expect(cssVars['color.ink.purple']).toBe('--purple-ink');
    expect(cssVars['radius.pill']).toBe('--radius-pill');
  });
});

describe('build/kotlin/LumiraTokens.kt and build/swift/LumiraTokens.swift', () => {
  const kt = read('build/kotlin/LumiraTokens.kt');
  const swift = read('build/swift/LumiraTokens.swift');

  it('Compose object carries colors, belts, dark overlay, motion and radii', () => {
    for (const line of [
      'object LumiraTokens {',
      'val Purple700 = Color(0xFF4F2389)',
      'val BeltBlue = Color(0xFF1E5CB3)',
      'val InkPink = Color(0xFFA83C78)',
      'object DarkColors {',
      'val BgApp = Color(0xFF141021)',
      'val Pill = 999.dp',
      'val EaseOut = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)',
      'val DurFast = 120 // ms',
    ]) {
      expect(kt).toContain(line);
    }
  });

  it('Swift enum carries colors, belts, dark overlay, motion and radii', () => {
    for (const line of [
      'public enum LumiraTokens {',
      'public static let purple700 = Color(lumiraHex: 0xFF4F2389)',
      'public static let beltBlue = Color(lumiraHex: 0xFF1E5CB3)',
      'public enum DarkColors {',
      'public static let bgApp = Color(lumiraHex: 0xFF141021)',
      'public static let pill: CGFloat = 999',
      'public static let easeOut: (Double, Double, Double, Double) = (0.22, 1, 0.36, 1)',
      'public static let durFast: TimeInterval = 0.12',
    ]) {
      expect(swift).toContain(line);
    }
  });
});
