/**
 * DS.5 behavior tests (spec 002 "Testing Decisions"): the theme exposes the
 * contracted slot values — resolved from tokens / the derived palette, never
 * raw hex typed here beyond the token constants themselves.
 */

import { describe, expect, it } from 'vitest';
import type { CssVarsTheme, Theme } from '@mui/material/styles';
import { tokens, darkTokens, webCss } from '../../build/web/tokens.ts';
import { derivePalette } from './derive-palette.ts';
import { READY_MADE_PALETTES, TATAME_DEFAULT_BRAND } from './presets.ts';
import { createTatameTheme, buildShadowPlateau } from './create-tatame-theme.ts';
import { glassSurface, glowShadow, hexToRgba } from './glass.ts';

type VarsTheme = Theme & CssVarsTheme;

const defaultLight = derivePalette(TATAME_DEFAULT_BRAND, 'light');
const theme = createTatameTheme(defaultLight, 'light') as VarsTheme;

describe('createTatameTheme — palette mapping (ds-02 §2)', () => {
  it('maps primary/secondary from the derived brand scale, not literals', () => {
    expect(theme.palette.primary.main).toBe(defaultLight['purple-700']);
    expect(theme.palette.primary.light).toBe(defaultLight['purple-500']);
    expect(theme.palette.primary.dark).toBe(defaultLight['purple-800']);
    expect(theme.palette.secondary.main).toBe(defaultLight['pink-500']);
    // Default brand resolves to the static Lumira tokens.
    expect(theme.palette.primary.main).toBe(tokens.color.purple[700]);
    expect(theme.palette.secondary.main).toBe(tokens.color.pink[500]);
  });

  it('maps semantics from the static semantic tokens', () => {
    expect(theme.palette.success.main).toBe(tokens.color.success[500]);
    expect(theme.palette.warning.main).toBe(tokens.color.warning[500]);
    expect(theme.palette.error.main).toBe(tokens.color.danger[500]);
    expect(theme.palette.info.main).toBe(tokens.color.info[500]);
    expect(theme.palette.success.light).toBe(tokens.color.success[100]);
  });

  it('text is ink purple and NEVER pure black — common.black tripwire', () => {
    expect(theme.palette.text.primary).toBe(defaultLight['purple-950']);
    expect(theme.palette.text.secondary).toBe(defaultLight['purple-800']);
    expect(theme.palette.text.primary).not.toBe('#000');
    expect(theme.palette.text.primary).not.toBe('#000000');
    expect(theme.palette.common.black).toBe(defaultLight['purple-950']);
  });

  it('canvas background comes from the bg tokens', () => {
    expect(theme.palette.background.default).toBe(tokens.color.bg.app);
    expect(theme.palette.background.paper).toBe(tokens.color.bg.surface);
    expect(theme.palette.divider).toBe(tokens.color.border[1]);
  });

  it('focus action derives from purple-500 at the focus-ring alpha', () => {
    expect(theme.palette.action.focus).toBe(
      hexToRgba(defaultLight['purple-500'], tokens.focus.ring.alpha),
    );
  });
});

describe('createTatameTheme — CSS variables mode', () => {
  it('enables cssVariables with the shared data-theme selector', () => {
    expect(theme.vars).toBeDefined();
    expect(theme.vars.palette.primary.main).toMatch(/^var\(--/);
    expect(theme.colorSchemes.light).toBeDefined();
  });

  it('brand swap produces different underlying CSS var values', () => {
    const navy = derivePalette(READY_MADE_PALETTES.navy, 'light');
    const navyTheme = createTatameTheme(navy, 'light') as VarsTheme;
    expect(navyTheme.palette.primary.main).toBe(navy['purple-700']);
    expect(navyTheme.palette.primary.main).not.toBe(theme.palette.primary.main);
    // Same var name, different resolved value — a var flip, not a recompile.
    const varName = (s: string) => /var\((--[\w-]+)/.exec(s)?.[1];
    expect(varName(navyTheme.vars.palette.primary.main)).toBe(
      varName(theme.vars.palette.primary.main),
    );
    const css = (t: VarsTheme) => JSON.stringify(t.colorSchemes);
    expect(css(navyTheme)).not.toBe(css(theme));
  });

  it('mode swap: dark theme uses the static dark set + dark-derived brand', () => {
    const darkPalette = derivePalette(TATAME_DEFAULT_BRAND, 'dark');
    const darkTheme = createTatameTheme(darkPalette, 'dark');
    expect(darkTheme.palette.mode).toBe('dark');
    expect(darkTheme.palette.background.default).toBe(darkTokens.color.bg.app);
    expect(darkTheme.palette.background.paper).toBe(darkTokens.color.bg.surface);
    expect(darkTheme.palette.text.primary).toBe(darkTokens.color.fg[1]);
    expect(darkTheme.palette.divider).toBe(darkTokens.color.border[1]);
    expect(darkTheme.palette.primary.main).toBe(darkPalette['purple-700']);
  });

  it('throws on a palette that is not a derivePalette() output', () => {
    expect(() => createTatameTheme({}, 'light')).toThrow(/derived palette/);
  });
});

describe('createTatameTheme — typography (ds-02 §3)', () => {
  it('uses the Quicksand stack from the font tokens', () => {
    expect(theme.typography.fontFamily).toContain('Quicksand');
    expect(theme.typography.fontFamily).toContain('system-ui');
  });

  it('h1 is the 25/700 screen title with -0.02em tracking', () => {
    expect(theme.typography.h1.fontSize).toBe('25px');
    expect(theme.typography.h1.fontWeight).toBe(tokens.font.weight.bold);
    expect(theme.typography.h1.letterSpacing).toBe('-0.02em');
    expect(theme.typography.h1.lineHeight).toBe(tokens.text.lineHeight.tight);
  });

  it('body is 13–14px and buttons are sentence case 15/700', () => {
    expect(theme.typography.body1.fontSize).toBe('14px');
    expect(theme.typography.body2.fontSize).toBe('13px');
    expect(theme.typography.button.fontSize).toBe('15px');
    expect(theme.typography.button.fontWeight).toBe(tokens.font.weight.bold);
    expect(theme.typography.button.textTransform).toBe('none');
  });

  it('overline eyebrow is 11/600 caps with brand-2 color', () => {
    expect(theme.typography.overline.fontSize).toBe('11px');
    expect(theme.typography.overline.textTransform).toBe('uppercase');
    expect(theme.typography.overline.color).toBe(defaultLight['purple-500']);
  });
});

describe('createTatameTheme — shape and shadows (ds-02 §4)', () => {
  it('base radius is the radius-md token (14)', () => {
    expect(theme.shape.borderRadius).toBe(tokens.radius.md);
    expect(tokens.radius.md).toBe(14);
  });

  it('rebuilds the 25-slot shadow array as a plateau of the 5 named levels', () => {
    const shadows = buildShadowPlateau();
    expect(shadows).toHaveLength(25);
    expect(shadows[0]).toBe('none');
    expect(shadows[1]).toBe(webCss.shadow.xs);
    expect(shadows[2]).toBe(webCss.shadow.sm);
    expect(shadows[3]).toBe(webCss.shadow.sm);
    expect(shadows[4]).toBe(webCss.shadow.md);
    expect(shadows[7]).toBe(webCss.shadow.md);
    expect(shadows[8]).toBe(webCss.shadow.lg);
    expect(shadows[15]).toBe(webCss.shadow.lg);
    expect(shadows[16]).toBe(webCss.shadow.xl);
    expect(shadows[24]).toBe(webCss.shadow.xl);
    expect(theme.shadows).toEqual(shadows);
    // Only the 5 named levels + none — no interpolated values.
    expect(new Set(shadows).size).toBe(6);
  });

  it('glow is NOT in the shadow array — it is the named CTA mixin', () => {
    expect(theme.shadows).not.toContain(webCss.shadow.glow);
    expect(glowShadow()).toBe(webCss.shadow.glow);
    // Re-branded glow keeps geometry, swaps hue.
    const navy = derivePalette(READY_MADE_PALETTES.navy, 'light');
    expect(glowShadow(navy['purple-500'])).not.toBe(webCss.shadow.glow);
    expect(glowShadow(navy['purple-500'])).toMatch(/^0 8px 32px rgba\(/);
  });
});

describe('glassSurface mixin (ds-02 §6)', () => {
  it('consumes only the glass CSS vars so brand/dark flips are free', () => {
    const regular = glassSurface('regular');
    expect(regular['background']).toBe('var(--glass-bg)');
    expect(regular['backdropFilter']).toBe('blur(var(--glass-blur)) saturate(var(--glass-saturation))');
    expect(regular['border']).toBe('1px solid var(--glass-border)');
    expect(regular['boxShadow']).toBe('var(--glass-shadow)');
    expect(regular['&::before']).toMatchObject({ background: 'var(--glass-shine)' });
  });

  it('deep variant uses the stronger blur and deeper tint', () => {
    const deep = glassSurface('deep');
    expect(deep['background']).toBe('var(--glass-bg-deep)');
    expect(deep['backdropFilter']).toBe('blur(var(--glass-blur-strong)) saturate(var(--glass-saturation))');
  });
});
