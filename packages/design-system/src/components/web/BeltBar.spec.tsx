/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { BeltBar, BeltChip, beltChipLabel } from './BeltBar.tsx';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');
const renderUi = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

afterEach(() => vi.restoreAllMocks());

describe('BeltBar', () => {
  it('draws the bar + ponteira with one stripe per current degree', () => {
    const { container } = renderUi(
      <BeltBar colorSlug="belt.blue" degrees={2} maxDegrees={4} name="Faixa azul · 2 graus" />,
    );
    const bar = screen.getByRole('img', { name: 'Faixa azul · 2 graus' });
    expect(bar.style.background).toContain('--belt-blue');
    expect(container.querySelector('.BeltBar-tip')).toBeTruthy();
    expect(container.querySelectorAll('.BeltBar-stripe')).toHaveLength(2);
  });

  it('clamps stripes to maxDegrees', () => {
    const { container } = renderUi(
      <BeltBar colorSlug="belt.green" degrees={9} maxDegrees={4} name="Verde" />,
    );
    expect(container.querySelectorAll('.BeltBar-stripe')).toHaveLength(4);
  });

  it('renders the black belt with the red ponteira and white dan stripes', () => {
    const { container } = renderUi(
      <BeltBar
        colorSlug="belt.black"
        tipColorSlug="belt.red"
        degrees={3}
        maxDegrees={6}
        name="Faixa preta · 3º dan"
      />,
    );
    const tip = container.querySelector<HTMLElement>('.BeltBar-tip');
    expect(tip?.style.background).toContain('--belt-red');
    expect(container.querySelectorAll('.BeltBar-stripe')).toHaveLength(3);
  });

  it('renders the red belt solid — maxDegrees 0 means no stripes, default tip', () => {
    const { container } = renderUi(
      <BeltBar colorSlug="belt.red" degrees={0} maxDegrees={0} name="Faixa vermelha" />,
    );
    const bar = screen.getByRole('img', { name: 'Faixa vermelha' });
    expect(bar.style.background).toContain('--belt-red');
    expect(container.querySelectorAll('.BeltBar-stripe')).toHaveLength(0);
    expect(container.querySelector<HTMLElement>('.BeltBar-tip')?.style.background).toContain(
      '--belt-tip',
    );
  });

  it('keeps the white belt visible via the inset belt.outline hairline', () => {
    renderUi(<BeltBar colorSlug="belt.white" degrees={0} name="Faixa branca" />);
    const bar = screen.getByRole('img', { name: 'Faixa branca' });
    expect(bar.style.background).toContain('--belt-white');
    // The outline is part of the component contract, not a per-surface fix.
    expect(bar.style.boxShadow).toContain('--belt-outline');
  });

  it('falls back to gray with a logged warning on an unknown colorSlug', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderUi(<BeltBar colorSlug="belt.coral" name="Faixa coral" />);
    const bar = screen.getByRole('img', { name: 'Faixa coral' });
    expect(bar.style.background).toContain('--belt-gray');
    expect(bar.className).toContain('BeltBar-fallback');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('belt.coral'));
  });

  it('exposes the size scale as classes with fixed heights', () => {
    renderUi(
      <>
        <BeltBar colorSlug="blue" size="sm" name="sm" />
        <BeltBar colorSlug="blue" size="md" name="md" />
        <BeltBar colorSlug="blue" size="lg" name="lg" />
      </>,
    );
    const sm = screen.getByRole('img', { name: 'sm' });
    const lg = screen.getByRole('img', { name: 'lg' });
    expect(sm.className).toContain('BeltBar-sm');
    expect(lg.className).toContain('BeltBar-lg');
    expect(parseInt(lg.style.height, 10)).toBeGreaterThan(parseInt(sm.style.height, 10));
  });
});

describe('BeltChip', () => {
  it('composes the sm bar with the computed pt-BR label', () => {
    const { container } = renderUi(
      <BeltChip name="Azul" colorSlug="belt.blue" degrees={2} maxDegrees={4} />,
    );
    expect(screen.getByRole('img', { name: 'Faixa azul · 2 graus' })).toBeTruthy();
    expect(container.querySelector('.BeltChip-label')?.textContent).toBe(
      'Faixa azul · 2 graus',
    );
    expect(container.querySelector('.BeltBar-sm')).toBeTruthy();
  });

  it('omits degrees at zero and honors singular/label override/dimmed', () => {
    expect(beltChipLabel('Branca')).toBe('Faixa branca');
    expect(beltChipLabel('Azul', 1)).toBe('Faixa azul · 1 grau');
    const { container } = renderUi(
      <BeltChip name="Laranja" colorSlug="belt.orange" label="Laranja" dimmed />,
    );
    expect(container.querySelector('.BeltChip-label')?.textContent).toBe('Laranja');
    expect(container.querySelector('.BeltChip-dimmed')).toBeTruthy();
  });
});
