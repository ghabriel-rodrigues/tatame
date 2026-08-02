import { applyBrand, type CssVarTarget } from './apply-brand.ts';
import { derivePalette } from './derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from './presets.ts';

describe('applyBrand', () => {
  function fakeTarget(): CssVarTarget & { vars: Record<string, string> } {
    const vars: Record<string, string> = {};
    return {
      vars,
      style: {
        setProperty(name: string, value: string) {
          vars[name] = value;
        },
      },
    };
  }

  it('writes every derived token onto the matching Lumira CSS var as plain hex', () => {
    const derived = derivePalette(TATAME_DEFAULT_BRAND, 'light');
    const target = fakeTarget();
    applyBrand(derived, target);

    expect(Object.keys(target.vars)).toHaveLength(Object.keys(derived).length);
    expect(target.vars['--purple-700']).toBe('#4F2389');
    expect(target.vars['--purple-ink']).toBe(derived['purple-ink']);
    expect(target.vars['--pink-ink']).toBe(derived['pink-ink']);
    for (const value of Object.values(target.vars)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/); // no color-mix() strings in production
    }
  });

  it('throws without a document and without an explicit target', () => {
    expect(() => applyBrand({ 'purple-700': '#4F2389' })).toThrow(/no document/);
  });
});
