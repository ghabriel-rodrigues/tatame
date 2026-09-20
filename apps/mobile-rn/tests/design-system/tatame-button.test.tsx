/**
 * TatameButton — variants/states parity with the web executor (DS.7).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { TatameButton, ThemeProvider } from '@tatame/design-system/native';

describe('TatameButton', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    render(
      <ThemeProvider>
        <TatameButton label="Entrar" onPress={onPress} testID="btn" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Entrar')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('children win over label', () => {
    render(<TatameButton label="perde">ganha</TatameButton>);
    expect(screen.getByText('ganha')).toBeTruthy();
    expect(screen.queryByText('perde')).toBeNull();
  });

  it('disabled blocks presses and exposes accessibilityState', () => {
    const onPress = jest.fn();
    render(
      <TatameButton label="Entrar" disabled onPress={onPress} testID="btn" />,
    );
    const btn = screen.getByTestId('btn');
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('loading shows a spinner, keeps the label and blocks presses', () => {
    const onPress = jest.fn();
    render(
      <TatameButton label="Entrar" loading onPress={onPress} testID="btn" />,
    );
    const btn = screen.getByTestId('btn');
    expect(btn.props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    expect(screen.getByText('Entrar')).toBeTruthy();
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders every variant', () => {
    render(
      <>
        <TatameButton variant="primary" label="p" />
        <TatameButton variant="secondary" label="s" />
        <TatameButton variant="ghost" label="g" />
        <TatameButton variant="danger" label="d" />
      </>,
    );
    for (const l of ['p', 's', 'g', 'd'])
      expect(screen.getByText(l)).toBeTruthy();
  });
});
