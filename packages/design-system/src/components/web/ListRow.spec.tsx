/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { ListRow } from './ListRow.tsx';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');
const renderUi = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ListRow', () => {
  it('renders title, subtitle and slots on a static row', () => {
    const { getByText, queryByRole } = renderUi(
      <ListRow
        title="Lucas Almeida"
        subtitle="Fundamentos · mensal"
        leading={<span>LA</span>}
        trailing={<span>Ativo</span>}
      />,
    );
    expect(getByText('Lucas Almeida')).toBeTruthy();
    expect(getByText('Fundamentos · mensal')).toBeTruthy();
    expect(getByText('LA')).toBeTruthy();
    expect(getByText('Ativo')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it('is a real button when pressable and fires onPress', () => {
    const onPress = vi.fn();
    const { getByRole } = renderUi(<ListRow title="Fundamentos" chevron onPress={onPress} />);
    const row = getByRole('button', { name: /Fundamentos/ });
    row.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('applies the selected wash class', () => {
    const { getByRole } = renderUi(
      <ListRow title="Marina Costa" selected onPress={() => undefined} />,
    );
    expect(getByRole('button', { name: /Marina Costa/ }).className).toContain('ListRow-selected');
  });
});
