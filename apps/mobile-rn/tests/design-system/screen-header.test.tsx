/**
 * ScreenHeader — opener anatomy: back / eyebrow / title / subtitle /
 * trailing (DS.7).
 */

import { Text as RNText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScreenHeader, ThemeProvider } from '@tatame/design-system/native';

describe('ScreenHeader', () => {
  it('renders eyebrow, title and subtitle', () => {
    render(
      <ThemeProvider>
        <ScreenHeader eyebrow="sábado, 1 de agosto" title="Olá, Lucas" subtitle="Bom treino!" />
      </ThemeProvider>,
    );
    expect(screen.getByText('sábado, 1 de agosto')).toBeTruthy();
    expect(screen.getByText('Olá, Lucas')).toBeTruthy();
    expect(screen.getByText('Bom treino!')).toBeTruthy();
  });

  it('title is an accessibility header', () => {
    render(<ScreenHeader title="Agenda" />);
    expect(screen.getByRole('header', { name: 'Agenda' })).toBeTruthy();
  });

  it('back button renders only with onBack and fires it', () => {
    const onBack = jest.fn();
    const withBack = render(<ScreenHeader title="Detalhe" onBack={onBack} />);
    fireEvent.press(withBack.getByLabelText('Voltar'));
    expect(onBack).toHaveBeenCalledTimes(1);
    withBack.unmount();

    render(<ScreenHeader title="Início" />);
    expect(screen.queryByLabelText('Voltar')).toBeNull();
  });

  it('renders the trailing accessory slot', () => {
    render(<ScreenHeader title="Início" trailing={<RNText>sino</RNText>} />);
    expect(screen.getByText('sino')).toBeTruthy();
  });
});
