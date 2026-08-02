/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { FormField } from './FormField.tsx';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');
const renderUi = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('FormField', () => {
  it('associates the label with the input', () => {
    renderUi(<FormField label="Email" placeholder="voce@academia.com" />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
  });

  it('reports text changes through onChangeText', () => {
    const onChangeText = vi.fn();
    renderUi(<FormField label="Email" onChangeText={onChangeText} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    expect(onChangeText).toHaveBeenCalledWith('a@b.c');
  });

  it('error state shows the message and flags the input invalid', () => {
    renderUi(<FormField label="Email" error="Email inválido" />);
    expect(screen.getByText('Email inválido')).toBeTruthy();
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('password type ships the visibility toggle', () => {
    renderUi(<FormField label="Senha" type="password" />);
    const input = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(input.type).toBe('password');
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
    fireEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeTruthy();
  });

  it('plain text fields have no toggle', () => {
    renderUi(<FormField label="Nome" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
