/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactElement } from 'react';
import { derivePalette } from '../../theme/derive-palette.ts';
import { TATAME_DEFAULT_BRAND } from '../../theme/presets.ts';
import { createTatameTheme } from '../../theme/create-tatame-theme.ts';
import { MiniBarChart } from './MiniBarChart.tsx';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');
const renderUi = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const SERIES = [
  { label: 'MAI', value: 50 },
  { label: 'JUN', value: 75 },
  { label: 'JUL', value: 100 },
];

describe('MiniBarChart', () => {
  it('renders one labeled bar per point with heights scaled to the maximum', () => {
    const { container, getByText } = renderUi(
      <MiniBarChart data={SERIES} height={100} ariaLabel="Receita mensal" />,
    );
    const bars = container.querySelectorAll<HTMLElement>('.MiniBarChart-bar');
    expect(bars).toHaveLength(3);
    expect(bars[0]!.style.height).toBe('50px');
    expect(bars[1]!.style.height).toBe('75px');
    expect(bars[2]!.style.height).toBe('100px');
    for (const point of SERIES) expect(getByText(point.label)).toBeTruthy();
  });

  it('highlights the last point by default and honors highlightIndex', () => {
    const { container, rerender } = renderUi(<MiniBarChart data={SERIES} />);
    let bars = container.querySelectorAll('.MiniBarChart-bar');
    expect(bars[2]!.className).toContain('MiniBarChart-highlight');
    expect(bars[0]!.className).not.toContain('MiniBarChart-highlight');

    rerender(
      <ThemeProvider theme={theme}>
        <MiniBarChart data={SERIES} highlightIndex={0} />
      </ThemeProvider>,
    );
    bars = container.querySelectorAll('.MiniBarChart-bar');
    expect(bars[0]!.className).toContain('MiniBarChart-highlight');
    expect(bars[2]!.className).not.toContain('MiniBarChart-highlight');
  });

  it('renders formatted value captions and exposes them on the bar aria-label', () => {
    const { getByText, container } = renderUi(
      <MiniBarChart data={SERIES} formatValue={(value) => `R$ ${value}`} />,
    );
    expect(getByText('R$ 100')).toBeTruthy();
    const bars = container.querySelectorAll('.MiniBarChart-bar');
    expect(bars[2]!.getAttribute('aria-label')).toBe('JUL: R$ 100');
  });

  it('keeps a minimum visible bar for zero values (empty months stay drawn)', () => {
    const { container } = renderUi(
      <MiniBarChart data={[{ label: 'JAN', value: 0 }, { label: 'FEV', value: 10 }]} />,
    );
    const bars = container.querySelectorAll<HTMLElement>('.MiniBarChart-bar');
    expect(bars[0]!.style.height).toBe('4px');
  });

  it('is an accessible labeled image', () => {
    const { getByRole } = renderUi(<MiniBarChart data={SERIES} ariaLabel="Receita mensal" />);
    expect(getByRole('img', { name: 'Receita mensal' })).toBeTruthy();
  });
});
