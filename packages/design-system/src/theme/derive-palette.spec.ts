import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePalette, hexToOklab, type BrandInput } from './derive-palette.ts';
import { PALETTE_RECIPE } from './palette-recipe.data.ts';
import { READY_MADE_PALETTES, TATAME_DEFAULT_BRAND } from './presets.ts';
import { tokens, darkTokens } from '../../build/web/tokens.ts';

const pkgRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** OKLab distance (deltaE-OK). */
function deltaE(hex1: string, hex2: string): number {
  const [l1, a1, b1] = hexToOklab(hex1);
  const [l2, a2, b2] = hexToOklab(hex2);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe('derivePalette — golden fixture lock (ds-03)', () => {
  const file = JSON.parse(
    readFileSync(join(pkgRoot, 'tokens/palette-fixtures.json'), 'utf8'),
  ) as {
    fixtures: Record<string, { brand: BrandInput; light: Record<string, string>; dark: Record<string, string> }>;
  };

  it('covers the 4 ready-made presets', () => {
    expect(Object.keys(file.fixtures).sort()).toEqual(Object.keys(READY_MADE_PALETTES).sort());
  });

  it('re-derived output is byte-equal to the committed fixtures', () => {
    const regenerated: typeof file.fixtures = {};
    for (const [key, brand] of Object.entries(READY_MADE_PALETTES)) {
      regenerated[key] = {
        brand,
        light: derivePalette(brand, 'light'),
        dark: derivePalette(brand, 'dark'),
      };
    }
    // Byte-equality: identical key order AND identical hex strings.
    expect(JSON.stringify(regenerated, null, 2)).toBe(JSON.stringify(file.fixtures, null, 2));
  });

  it('every derived value is uppercase #RRGGBB', () => {
    for (const preset of Object.values(file.fixtures)) {
      for (const mode of ['light', 'dark'] as const) {
        for (const hex of Object.values(preset[mode])) {
          expect(hex).toMatch(/^#[0-9A-F]{6}$/);
        }
      }
    }
  });
});

describe('derivePalette — recipe semantics', () => {
  it('passes brand inputs through bit-exact on the anchor slots', () => {
    const brand: BrandInput = { deep: '#123456', vibrant: '#abcdef', accent: '#fedcba' };
    const out = derivePalette(brand, 'light');
    expect(out['purple-700']).toBe('#123456');
    expect(out['purple-500']).toBe('#ABCDEF');
    expect(out['pink-500']).toBe('#FEDCBA');
  });

  it('resolves the symbolic W anchor per mode', () => {
    const light = derivePalette(TATAME_DEFAULT_BRAND, 'light');
    const dark = derivePalette(TATAME_DEFAULT_BRAND, 'dark');
    // W-anchored tints must differ across modes...
    expect(light['purple-100']).not.toBe(dark['purple-100']);
    // ...while non-W mixes are mode-independent.
    expect(light['purple-800']).toBe(dark['purple-800']);
    expect(light['pink-700']).toBe(dark['pink-700']);
  });

  it('ink tokens are mode-conditional (applyPalette lines 1026-1027)', () => {
    const light = derivePalette(TATAME_DEFAULT_BRAND, 'light');
    const dark = derivePalette(TATAME_DEFAULT_BRAND, 'dark');
    expect(light['purple-ink']).toBe('#4F2389'); // = deep
    expect(light['pink-ink']).toBe(light['pink-700']); // same mix(acc 64% #3B0A24)
    expect(dark['purple-ink']).not.toBe(light['purple-ink']);
    expect(dark['pink-ink']).not.toBe(light['pink-ink']);
  });

  it('never derives belt tokens (ds-04 exemption)', () => {
    const out = derivePalette(TATAME_DEFAULT_BRAND, 'light');
    expect(Object.keys(out).some((k) => k.startsWith('belt'))).toBe(false);
  });

  it('covers the full brand scale: purple 50-950, pink 50-700, both inks', () => {
    const out = derivePalette(TATAME_DEFAULT_BRAND, 'light');
    const expected = [
      ...['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map((s) => `purple-${s}`),
      ...['50', '100', '200', '300', '400', '500', '600', '700'].map((s) => `pink-${s}`),
      'purple-ink',
      'pink-ink',
    ];
    expect(Object.keys(out).sort()).toEqual(expected.sort());
  });
});

describe('derivePalette — default preset approximates the static Lumira scale', () => {
  // The static scale in colors_and_type.css is hand-tuned; the recipe is the
  // prototypes' applyPalette(), which they run on mount — so at runtime the
  // prototypes actually display the DERIVED values. The derived scale is the
  // production truth; this test documents how close it stays to the frozen
  // reference. Max observed deltaE-OK = 0.0577 (purple-300): OKLab mixing
  // toward white desaturates mid-tints slightly vs the hand-tuned values.
  const TOLERANCE = 0.06;

  const light = derivePalette(TATAME_DEFAULT_BRAND, 'light');

  it('anchor slots are exact', () => {
    expect(light['purple-700']).toBe(tokens.color.purple['700']);
    expect(light['purple-500']).toBe(tokens.color.purple['500']);
    expect(light['pink-500']).toBe(tokens.color.pink['500']);
  });

  it(`every derived scale token is within deltaE-OK ${TOLERANCE} of the static token`, () => {
    const staticScales: Record<string, string> = {};
    for (const [step, hex] of Object.entries(tokens.color.purple)) staticScales[`purple-${step}`] = hex;
    for (const [step, hex] of Object.entries(tokens.color.pink)) staticScales[`pink-${step}`] = hex;

    const report: Record<string, number> = {};
    for (const [token, staticHex] of Object.entries(staticScales)) {
      report[token] = deltaE(staticHex, light[token]!);
    }
    for (const [token, dE] of Object.entries(report)) {
      expect(dE, `${token}: static ${staticScales[token]} vs derived ${light[token]}`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    }
  });

  it('static dark tints in tokens.json equal derivePalette(default, dark)', () => {
    const dark = derivePalette(TATAME_DEFAULT_BRAND, 'dark');
    for (const [step, hex] of Object.entries(darkTokens.color.purple)) {
      expect(dark[`purple-${step}`]).toBe(hex);
    }
    for (const [step, hex] of Object.entries(darkTokens.color.pink)) {
      expect(dark[`pink-${step}`]).toBe(hex);
    }
    expect(dark['purple-ink']).toBe(darkTokens.color.ink.purple);
    expect(dark['pink-ink']).toBe(darkTokens.color.ink.pink);
  });
});

describe('palette-recipe.data.ts mirror', () => {
  it('is content-identical to the canonical tokens/palette-recipe.json', () => {
    const json = JSON.parse(readFileSync(join(pkgRoot, 'tokens/palette-recipe.json'), 'utf8'));
    delete json.$description;
    expect(PALETTE_RECIPE).toEqual(json);
  });
});
