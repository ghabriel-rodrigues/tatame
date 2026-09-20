/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { BrandLogo } from './BrandLogo.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('BrandLogo', () => {
  it('is an accessible image named Tatame by default', () => {
    renderUi(<BrandLogo />);
    expect(screen.getByRole('img', { name: 'Tatame' })).toBeTruthy();
  });

  it('draws the frozen belt anatomy: white bar + dark tip + 2 stripes', () => {
    const { container } = renderUi(<BrandLogo />);
    expect(container.querySelector('.BrandLogo-belt')).toBeTruthy();
    expect(container.querySelector('.BrandLogo-tip')).toBeTruthy();
    expect(container.querySelectorAll('.BrandLogo-stripe')).toHaveLength(2);
  });

  it('supports size variants and the bare (unboxed) splash form', () => {
    renderUi(
      <>
        <BrandLogo size="lg" label="Logo grande" />
        <BrandLogo size="sm" boxed={false} label="Logo simples" />
      </>,
    );
    const lg = screen.getByRole('img', { name: 'Logo grande' });
    expect(lg.className).toContain('BrandLogo-lg');
    expect(lg.className).toContain('BrandLogo-boxed');
    const sm = screen.getByRole('img', { name: 'Logo simples' });
    expect(sm.className).toContain('BrandLogo-sm');
    expect(sm.className).toContain('BrandLogo-bare');
  });
});
