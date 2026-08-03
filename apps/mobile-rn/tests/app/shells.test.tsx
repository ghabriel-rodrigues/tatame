/**
 * Authenticated shells (AUTH.20): session context rendered in DS Cards,
 * the delinquency read-only banner, the glass tab bar with the persona
 * FAB, and the perfil logout flow back to login.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi, type SessionState } from '../../src/session/session-store';
import { setRefreshToken } from '../../src/session/token-store';
import { installFetchMock, json, makeMe } from '../helpers/session';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __store: Map<string, string>; __reset: () => void };

function renderApp(state: SessionState) {
  sessionTestApi.seed(state);
  const utils = renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return utils;
}

describe('authenticated shells', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
    installFetchMock(() => null);
  });

  it('aluno home renders the session context cards', () => {
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });
    expect(screen.getByText('Olá, Lucas')).toBeTruthy();
    expect(screen.getByText('Sessão')).toBeTruthy();
    expect(screen.getByText('Lucas Almeida')).toBeTruthy();
    expect(screen.getByText('aluno@tatame.dev')).toBeTruthy();
    expect(screen.getAllByText('Aluno').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alpha Jiu-Jitsu').length).toBeGreaterThan(0);
    expect(screen.getByText('Completo')).toBeTruthy();
    expect(screen.queryByTestId('readonly-banner')).toBeNull();
  });

  it('delinquent academy renders the read-only banner and flag', () => {
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'student', academyStatus: 'delinquent' }),
    });
    expect(screen.getByTestId('readonly-banner')).toBeTruthy();
    expect(screen.getByText('Modo somente leitura')).toBeTruthy();
    expect(screen.getByText('Somente leitura')).toBeTruthy();
  });

  it('tab bar exposes the four tabs and the persona FAB', () => {
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });
    expect(screen.getByTestId('glass-tab-bar')).toBeTruthy();
    for (const label of ['Início', 'Agenda', 'Carteira', 'Perfil']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText('Check-in')).toBeTruthy();
  });

  it('perfil tab logs out: revoke + wipe + back to login', async () => {
    await setRefreshToken('rt-1');
    let revoked = false;
    installFetchMock(({ method, path }) => {
      if (method === 'POST' && path === '/v1/auth/logout') {
        revoked = true;
        return json(200, { ok: true });
      }
      return null;
    });
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });
    expect(screen.getByText('Sair')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Sair'));
    });
    await waitFor(() => expect(screen.getByText('Bem-vindo de volta')).toBeTruthy());
    expect(revoked).toBe(true);
    expect(secure.__store.size).toBe(0);
  });

  it('suspended screen still allows logout', async () => {
    await setRefreshToken('rt-1');
    installFetchMock(({ method, path }) =>
      method === 'POST' && path === '/v1/auth/logout' ? json(200, { ok: true }) : null,
    );
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'student', academyStatus: 'suspended' }),
    });
    expect(screen.getByText('Academia suspensa')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sair'));
    });
    await waitFor(() => expect(screen.getByText('Bem-vindo de volta')).toBeTruthy());
    expect(secure.__store.size).toBe(0);
  });
});
