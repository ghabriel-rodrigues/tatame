/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { TatameButton } from './TatameButton.tsx';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');
const renderUi = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('TatameButton', () => {
  it('renders an accessible button with its label', () => {
    renderUi(<TatameButton label="Entrar" />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('defaults to the primary variant (contained MUI primary)', () => {
    renderUi(<TatameButton label="Entrar" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('TatameButton-primary');
    expect(button.className).toContain('MuiButton-contained');
    expect(button.className).toContain('MuiButton-colorPrimary');
  });

  it('exposes the shared variant vocabulary as classes', () => {
    renderUi(
      <>
        <TatameButton variant="secondary" label="Ver depois" />
        <TatameButton variant="ghost" label="Cancelar" />
        <TatameButton variant="danger" label="Excluir" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Ver depois' }).className).toContain(
      'TatameButton-secondary',
    );
    const ghost = screen.getByRole('button', { name: 'Cancelar' });
    expect(ghost.className).toContain('TatameButton-ghost');
    expect(ghost.className).toContain('MuiButton-text');
    const danger = screen.getByRole('button', { name: 'Excluir' });
    expect(danger.className).toContain('TatameButton-danger');
  });

  it('maps onPress to click', () => {
    const onPress = vi.fn();
    renderUi(<TatameButton label="Entrar" onPress={onPress} />);
    screen.getByRole('button').click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('loading disables the button and announces aria-busy', () => {
    const onPress = vi.fn();
    renderUi(<TatameButton label="Entrar" loading onPress={onPress} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    button.click();
    expect(onPress).not.toHaveBeenCalled();
  });
});
