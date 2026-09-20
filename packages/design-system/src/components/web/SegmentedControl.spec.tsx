/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

const theme = createTatameTheme(
  derivePalette(TATAME_DEFAULT_BRAND, 'light'),
  'light',
);
const renderUi = (ui: ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const OPTIONS = [
  { value: 'alunos', label: 'Alunos' },
  { value: 'turmas', label: 'Turmas' },
] as const;

describe('SegmentedControl', () => {
  it('renders a labeled tablist with the selected segment marked', () => {
    const { getByRole } = renderUi(
      <SegmentedControl
        options={OPTIONS}
        value="alunos"
        onChange={() => undefined}
        ariaLabel="Tipo de cadastro"
      />,
    );
    expect(getByRole('tablist', { name: 'Tipo de cadastro' })).toBeTruthy();
    expect(
      getByRole('tab', { name: 'Alunos' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      getByRole('tab', { name: 'Turmas' }).getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('emits the tapped segment value', () => {
    const onChange = vi.fn();
    const { getByRole } = renderUi(
      <SegmentedControl
        options={OPTIONS}
        value="alunos"
        onChange={onChange}
        ariaLabel="Tipo de cadastro"
      />,
    );
    getByRole('tab', { name: 'Turmas' }).click();
    expect(onChange).toHaveBeenCalledWith('turmas');
  });
});
