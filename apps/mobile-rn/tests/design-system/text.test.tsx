/**
 * Text primitive — Quicksand family mapping + product type scale (DS.7).
 */

import { StyleSheet, type TextStyle } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  Text,
  ThemeProvider,
  quicksandFamily,
} from '@tatame/design-system/native';

function flat(el: { props: { style?: unknown } }): TextStyle {
  return StyleSheet.flatten((el.props.style ?? {}) as TextStyle);
}

describe('Text', () => {
  it('applies the Quicksand family for the variant weight', () => {
    render(<Text variant="display">Título</Text>);
    const style = flat(screen.getByText('Título'));
    expect(style.fontFamily).toMatch(/^Quicksand[-_]/);
    expect(style.fontFamily).toBe(quicksandFamily('bold'));
  });

  it('display variant: 25px, tight tracking (-0.02em -> -0.5px)', () => {
    render(<Text variant="display">Bem-vindo</Text>);
    const style = flat(screen.getByText('Bem-vindo'));
    expect(style.fontSize).toBe(25);
    expect(style.letterSpacing).toBeCloseTo(-0.5);
  });

  it('body defaults + weight/color overrides', () => {
    render(
      <ThemeProvider>
        <Text weight="semibold" color="#123456">
          corpo
        </Text>
      </ThemeProvider>,
    );
    const style = flat(screen.getByText('corpo'));
    expect(style.fontSize).toBe(14);
    expect(style.fontFamily).toBe(quicksandFamily('semibold'));
    expect(style.color).toBe('#123456');
  });

  it('overline uppercases and tracks wide', () => {
    render(<Text variant="overline">design system</Text>);
    const style = flat(screen.getByText('design system'));
    expect(style.textTransform).toBe('uppercase');
    expect(style.fontSize).toBe(11);
    expect(style.letterSpacing).toBeCloseTo(11 * 0.08);
  });
});
