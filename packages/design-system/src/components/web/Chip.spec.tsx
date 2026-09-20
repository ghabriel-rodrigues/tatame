/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { Chip } from './Chip.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Chip', () => {
  it('renders a static badge span with the tone class', () => {
    const { getByText } = renderUi(<Chip label="Ativo" tone="success" />);
    const chip = getByText('Ativo');
    expect(chip.tagName).toBe('SPAN');
    expect(chip.className).toContain('Chip-success');
    expect(chip.className).toContain('Chip-sm');
  });

  it('becomes a pressable button with aria-pressed when onPress is given', () => {
    const onPress = vi.fn();
    const { getByRole } = renderUi(
      <Chip label="Seg" size="md" selected onPress={onPress} />,
    );
    const button = getByRole('button', { name: 'Seg' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.className).toContain('Chip-selected');
    button.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = vi.fn();
    const { getByRole } = renderUi(
      <Chip label="Dom" onPress={onPress} disabled />,
    );
    const button = getByRole('button', { name: 'Dom' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    button.click();
    expect(onPress).not.toHaveBeenCalled();
  });
});
