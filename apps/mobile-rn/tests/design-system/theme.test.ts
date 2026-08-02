/**
 * createTheme() — theming runtime resolution (DS.7).
 * Static defaults, white-label overlay + semantic re-pointing, dark set.
 */

import {
  createTheme,
  derivePalette,
  READY_MADE_PALETTES,
  tokens,
} from '@tatame/design-system/native';

describe('createTheme', () => {
  it('defaults to the static Lumira light tokens with no brand', () => {
    const theme = createTheme();
    expect(theme.mode).toBe('light');
    expect(theme.brand).toBeNull();
    expect(theme.color.brand['1']).toBe('#4F2389');
    expect(theme.color.brand['2']).toBe('#8B3DEB');
    expect(theme.color.fg['1']).toBe('#1A0B2E');
    expect(theme.radius.md).toBe(14);
    expect(theme.motion.duration.slow).toBe(320);
  });

  it('overlays a white-label brand onto the purple/pink scales', () => {
    const navy = READY_MADE_PALETTES.navy;
    const derived = derivePalette(navy, 'light');
    const theme = createTheme({ brand: navy });

    expect(theme.color.purple['700']).toBe(derived['purple-700']);
    expect(theme.color.purple['500']).toBe(derived['purple-500']);
    expect(theme.color.pink['500']).toBe(derived['pink-500']);
    expect(theme.color.ink.purple).toBe(derived['purple-ink']);
    expect(theme.color.ink.pink).toBe(derived['pink-ink']);
  });

  it('re-points semantic aliases at the re-branded scales', () => {
    const navy = READY_MADE_PALETTES.navy;
    const derived = derivePalette(navy, 'light');
    const theme = createTheme({ brand: navy });

    expect(theme.color.brand['1']).toBe(derived['purple-700']);
    expect(theme.color.brand['2']).toBe(derived['purple-500']);
    expect(theme.color.brand.accent).toBe(derived['pink-500']);
    expect(theme.color.brand.tint).toBe(derived['purple-50']);
    expect(theme.color.fg['1']).toBe(derived['purple-950']);
    expect(theme.color.border.strong).toBe(derived['purple-700']);
    expect(theme.focus.ring.color).toBe(derived['purple-500']);
    // Glow + glass stroke re-brand their hue but keep token alpha.
    expect(theme.shadow.glow[0].color).toContain('0.35');
    expect(theme.glass.stroke).toContain('0.18');
  });

  it('belts never re-brand (static, brand-independent tokens)', () => {
    const theme = createTheme({ brand: READY_MADE_PALETTES.navy });
    expect(theme.color.belt).toEqual(tokens.color.belt);
  });

  it('dark mode applies the static dark set before the brand overlay', () => {
    const theme = createTheme({ mode: 'dark' });
    expect(theme.color.bg.app).toBe('#141021');
    expect(theme.color.fg['1']).toBe('#F2EFFA');
    // Non-overridden values fall through from the light set.
    expect(theme.color.success['500']).toBe('#2BB673');
  });
});
