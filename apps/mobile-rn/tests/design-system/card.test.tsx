/**
 * Card — four surface variants; glass goes through GlassSurface (DS.7).
 */

import { Text as RNText } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Card, ThemeProvider } from '@tatame/design-system/native';

describe('Card', () => {
  it.each(['surface', 'hero', 'tinted', 'glass'] as const)(
    '%s variant renders its children',
    (variant) => {
      render(
        <ThemeProvider>
          <Card variant={variant} testID="card">
            <RNText>conteúdo</RNText>
          </Card>
        </ThemeProvider>,
      );
      expect(screen.getByTestId('card')).toBeTruthy();
      expect(screen.getByText('conteúdo')).toBeTruthy();
    },
  );

  it('glass variant composes the BlurView glass primitive', () => {
    render(
      <Card variant="glass">
        <RNText>vidro</RNText>
      </Card>,
    );
    expect(screen.getByTestId('glass-blur')).toBeTruthy();
  });

  it('non-glass variants do not pull blur', () => {
    render(
      <Card>
        <RNText>sólido</RNText>
      </Card>,
    );
    expect(screen.queryByTestId('glass-blur')).toBeNull();
  });
});
