/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { Toast } from './Toast.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the message as a polite status', () => {
    renderUi(<Toast open message="Check-in confirmado" />);
    const toast = screen.getByRole('status');
    expect(toast.textContent).toBe('Check-in confirmado');
    expect(toast.getAttribute('aria-live')).toBe('polite');
  });

  it('renders nothing while closed', () => {
    renderUi(<Toast open={false} message="Oculto" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('auto-hides after the ~2.6s contract default', () => {
    const onClose = vi.fn();
    renderUi(<Toast open message="Salvo" onClose={onClose} />);
    vi.advanceTimersByTime(2599);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('honors a custom duration', () => {
    const onClose = vi.fn();
    renderUi(<Toast open message="Salvo" onClose={onClose} duration={500} />);
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
