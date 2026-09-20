/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { EmptyState } from './EmptyState.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('EmptyState', () => {
  it('renders title, description and action slot', () => {
    const { getByText, getByRole } = renderUi(
      <EmptyState
        title="Nenhum aluno ainda"
        description="Use o botão + para criar o primeiro registro."
        action={<button type="button">Criar</button>}
      />,
    );
    expect(getByText('Nenhum aluno ainda')).toBeTruthy();
    expect(
      getByText('Use o botão + para criar o primeiro registro.'),
    ).toBeTruthy();
    expect(getByRole('button', { name: 'Criar' })).toBeTruthy();
  });

  it('renders without optional slots', () => {
    const { getByText } = renderUi(<EmptyState title="Sem registros" />);
    expect(getByText('Sem registros')).toBeTruthy();
  });
});
