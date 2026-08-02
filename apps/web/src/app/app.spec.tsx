import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import {
  createTatameTheme,
  derivePalette,
  TATAME_DEFAULT_BRAND,
} from '@tatame/design-system';

import App from './app';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');

const renderApp = () =>
  render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  );

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = renderApp();
    expect(baseElement).toBeTruthy();
  });

  it('renders the design-system placeholder title as an h1', () => {
    renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bem-vindo ao Tatame' }),
    ).toBeTruthy();
  });

  it('composes the P0 components (logo, fields, CTA)', () => {
    renderApp();
    expect(screen.getByRole('img', { name: 'Tatame' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Senha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });
});
