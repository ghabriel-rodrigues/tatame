/**
 * BeltBar (GRD.15) — ds-04 resolved anatomy: bar + ponteira + degree
 * stripes drawn with Views, keyed by the BeltDef-shaped payload (never by
 * belt names). Rules under test: stripe count, black-belt red tip with
 * white dan stripes, red belt without stripes, gray fallback + warning,
 * and the chip variant.
 */

import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react-native';
import { BeltBar, BeltChip, ThemeProvider, createTheme } from '@tatame/design-system/native';

const theme = createTheme();

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const blue = {
  name: 'Azul',
  colorSlug: 'belt.blue',
  tipColorSlug: null,
  maxDegrees: 4,
  degrees: 2,
};

describe('BeltBar (GRD.15)', () => {
  it('draws bar + ponteira + one white stripe per degree', () => {
    renderWithTheme(<BeltBar belt={blue} testID="belt" />);

    const bar = screen.getByTestId('belt');
    expect(JSON.stringify(bar.props.style)).toContain(`"backgroundColor":"${theme.color.belt.blue}"`);

    const tip = screen.getByTestId('beltbar-tip');
    expect(JSON.stringify(tip.props.style)).toContain(`"backgroundColor":"${theme.color.belt.tip}"`);

    const stripes = screen.getAllByTestId('beltbar-stripe');
    expect(stripes).toHaveLength(2);
    expect(JSON.stringify(stripes[0]!.props.style)).toContain(
      `"backgroundColor":"${theme.color.belt.stripe}"`,
    );
  });

  it('is an accessible image labeled with the belt and degrees', () => {
    renderWithTheme(<BeltBar belt={blue} />);
    expect(screen.getByLabelText('Faixa Azul · 2 graus')).toBeTruthy();
  });

  it('caps stripes at maxDegrees', () => {
    renderWithTheme(<BeltBar belt={{ ...blue, degrees: 9 }} testID="belt" />);
    expect(screen.getAllByTestId('beltbar-stripe')).toHaveLength(4);
  });

  it('black belt renders the red ponteira with white dan stripes', () => {
    renderWithTheme(
      <BeltBar
        belt={{
          name: 'Preta',
          colorSlug: 'belt.black',
          tipColorSlug: 'belt.red',
          maxDegrees: 6,
          degrees: 2,
        }}
        testID="belt"
      />,
    );
    const tip = screen.getByTestId('beltbar-tip');
    expect(JSON.stringify(tip.props.style)).toContain(`"backgroundColor":"${theme.color.belt.red}"`);
    expect(screen.getAllByTestId('beltbar-stripe')).toHaveLength(2);
  });

  it('red belt (maxDegrees 0) renders no stripes', () => {
    renderWithTheme(
      <BeltBar
        belt={{ name: 'Vermelha', colorSlug: 'belt.red', maxDegrees: 0, degrees: 0 }}
        testID="belt"
      />,
    );
    expect(screen.queryAllByTestId('beltbar-stripe')).toHaveLength(0);
    expect(screen.getByLabelText('Faixa Vermelha')).toBeTruthy();
  });

  it('unknown colorSlug falls back to gray and warns once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderWithTheme(
      <BeltBar
        belt={{ name: 'Coral', colorSlug: 'belt.coral', maxDegrees: 0, degrees: 0 }}
        testID="belt"
      />,
    );
    expect(JSON.stringify(screen.getByTestId('belt').props.style)).toContain(
      `"backgroundColor":"${theme.color.belt.gray}"`,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('belt.coral'));
    warn.mockRestore();
  });

  it('white belt keeps the hairline outline (never a gray fill)', () => {
    renderWithTheme(
      <BeltBar
        belt={{ name: 'Branca', colorSlug: 'belt.white', maxDegrees: 4, degrees: 0 }}
        testID="belt"
      />,
    );
    const styles = JSON.stringify(screen.getByTestId('belt').props.style);
    expect(styles).toContain(`"backgroundColor":"${theme.color.belt.white}"`);
    expect(styles).not.toContain(`"backgroundColor":"${theme.color.belt.gray}"`);
  });

  it('sizes change the bar height (sm 8 / md 12 / lg 16)', () => {
    const sm = renderWithTheme(<BeltBar belt={blue} size="sm" testID="belt-sm" />);
    expect(JSON.stringify(sm.getByTestId('belt-sm').props.style)).toContain('"height":8');
    sm.unmount();
    const lg = renderWithTheme(<BeltBar belt={blue} size="lg" testID="belt-lg" />);
    expect(JSON.stringify(lg.getByTestId('belt-lg').props.style)).toContain('"height":16');
  });

  it('chip variant renders the swatch + label pill, dimmed when disabled', () => {
    renderWithTheme(
      <BeltChip belt={blue} label="Faixa azul · 2 graus" testID="chip" />,
    );
    expect(screen.getByLabelText('Faixa azul · 2 graus')).toBeTruthy();
    expect(screen.getByText('Faixa azul · 2 graus')).toBeTruthy();

    renderWithTheme(<BeltChip belt={blue} dimmed testID="chip-dimmed" />);
    expect(JSON.stringify(screen.getByTestId('chip-dimmed').props.style)).toContain(
      '"opacity":0.45',
    );
  });
});
