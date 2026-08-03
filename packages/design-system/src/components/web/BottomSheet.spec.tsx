/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { BottomSheet } from './BottomSheet.tsx';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');
const renderUi = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('BottomSheet', () => {
  it('renders title, subtitle and content when open', () => {
    const { getByText, getByRole } = renderUi(
      <BottomSheet open onClose={() => undefined} title="Mover 2 alunos" subtitle="Escolha a turma">
        <p>Conteúdo</p>
      </BottomSheet>,
    );
    expect(getByRole('heading', { name: 'Mover 2 alunos' })).toBeTruthy();
    expect(getByText('Escolha a turma')).toBeTruthy();
    expect(getByText('Conteúdo')).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    const { queryByText } = renderUi(
      <BottomSheet open={false} onClose={() => undefined} title="Nova turma">
        <p>Oculto</p>
      </BottomSheet>,
    );
    expect(queryByText('Oculto')).toBeNull();
  });

  it('invokes onClose on scrim tap (modal dismiss contract)', () => {
    const onClose = vi.fn();
    const { baseElement } = renderUi(
      <BottomSheet open onClose={onClose} title="Nova turma">
        <p>Formulário</p>
      </BottomSheet>,
    );
    const backdrop = baseElement.querySelector('.MuiBackdrop-root');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalled();
  });
});
