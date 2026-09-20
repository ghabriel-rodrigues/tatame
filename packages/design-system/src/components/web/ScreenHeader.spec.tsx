/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { ScreenHeader } from './ScreenHeader.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ScreenHeader', () => {
  it('renders a banner landmark with an h1 title', () => {
    renderUi(<ScreenHeader title="Bem-vindo de volta" />);
    expect(screen.getByRole('banner')).toBeTruthy();
    const title = screen.getByRole('heading', {
      level: 1,
      name: 'Bem-vindo de volta',
    });
    expect(title.className).toContain('ScreenHeader-title');
  });

  it('renders optional eyebrow and subtitle', () => {
    renderUi(
      <ScreenHeader
        eyebrow="Sexta, 12 de junho"
        title="Olá, Rafa"
        subtitle="Bora treinar?"
      />,
    );
    expect(screen.getByText('Sexta, 12 de junho').className).toContain(
      'ScreenHeader-eyebrow',
    );
    expect(screen.getByText('Bora treinar?').className).toContain(
      'ScreenHeader-subtitle',
    );
  });

  it('back button only exists when onBack is provided, labeled Voltar', () => {
    const onBack = vi.fn();
    const { rerender } = renderUi(<ScreenHeader title="Graduação" />);
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
    rerender(
      <ThemeProvider theme={theme}>
        <ScreenHeader title="Graduação" onBack={onBack} />
      </ThemeProvider>,
    );
    screen.getByRole('button', { name: 'Voltar' }).click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the trailing accessory slot', () => {
    renderUi(<ScreenHeader title="Início" trailing={<span>sino</span>} />);
    expect(screen.getByText('sino')).toBeTruthy();
  });
});
