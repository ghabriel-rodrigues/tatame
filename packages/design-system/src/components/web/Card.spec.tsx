/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { Card } from './Card.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Card', () => {
  it('renders children on the default surface variant', () => {
    const { getByText } = renderUi(<Card>Conteúdo</Card>);
    const root = getByText('Conteúdo');
    expect(root.className).toContain('Card-root');
    expect(root.className).toContain('Card-surface');
  });

  it('exposes the shared variant vocabulary as classes', () => {
    const { getByText } = renderUi(
      <>
        <Card variant="hero">Hero</Card>
        <Card variant="tinted">Tinted</Card>
        <Card variant="glass">Glass</Card>
      </>,
    );
    expect(getByText('Hero').className).toContain('Card-hero');
    expect(getByText('Tinted').className).toContain('Card-tinted');
    expect(getByText('Glass').className).toContain('Card-glass');
  });

  it('accepts a custom padding', () => {
    const { getByText } = renderUi(<Card padding={0}>Zero</Card>);
    expect(getComputedStyle(getByText('Zero')).padding).toBe('0px');
  });
});
