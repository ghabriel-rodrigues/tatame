/**
 * FormField — label/error anatomy, change handler, password toggle (DS.7).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { FormField, ThemeProvider } from '@tatame/design-system/native';

describe('FormField', () => {
  it('renders label and forwards text changes', () => {
    const onChangeText = jest.fn();
    render(
      <ThemeProvider>
        <FormField label="Email" placeholder="Email" onChangeText={onChangeText} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Email')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.c');
    expect(onChangeText).toHaveBeenCalledWith('a@b.c');
  });

  it('shows the error message (wins over helperText)', () => {
    render(<FormField label="Senha" error="Campo obrigatório" helperText="dica" />);
    expect(screen.getByText('Campo obrigatório')).toBeTruthy();
    expect(screen.queryByText('dica')).toBeNull();
  });

  it('shows helperText when there is no error', () => {
    render(<FormField label="Senha" helperText="Mínimo 8 caracteres" />);
    expect(screen.getByText('Mínimo 8 caracteres')).toBeTruthy();
  });

  it('password type renders the visibility toggle', () => {
    render(<FormField label="Senha" type="password" placeholder="Senha" />);
    const input = screen.getByPlaceholderText('Senha');
    expect(input.props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByLabelText('Mostrar senha'));
    expect(screen.getByPlaceholderText('Senha').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Ocultar senha')).toBeTruthy();
  });

  it('disabled makes the input non-editable', () => {
    render(<FormField label="Email" disabled placeholder="Email" />);
    expect(screen.getByPlaceholderText('Email').props.editable).toBe(false);
  });

  it('email type configures the keyboard', () => {
    render(<FormField label="Email" type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoCapitalize).toBe('none');
  });
});
