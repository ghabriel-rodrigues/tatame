/**
 * Authenticated shells (AUTH.20, homes upgraded by ATT.16/18): persona
 * home mounts, the delinquency read-only banner, the glass tab bar with
 * the persona FAB, and the perfil logout flow back to login.
 */

import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import {
  sessionTestApi,
  type SessionState,
} from '../../src/session/session-store';
import { setRefreshToken } from '../../src/session/token-store';
import { installFetchMock, json, makeMe } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';

jest.useFakeTimers();

const secure = SecureStore as unknown as {
  __store: Map<string, string>;
  __reset: () => void;
};

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
    installFetchMock(({ method, path }) =>
      method === 'GET' && path === '/v1/aluno/home'
        ? json(200, makeAlunoHome())
        : null,
    );
  });

  it('aluno shell renders the real Início home (ATT.16)', async () => {
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });
    expect(screen.getByText('Olá, Lucas')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(screen.queryByTestId('readonly-banner')).toBeNull();
  });

  it('delinquent academy renders the read-only banner and flag', () => {
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'student', academyStatus: 'delinquent' }),
    });
    expect(screen.getByTestId('readonly-banner')).toBeTruthy();
    expect(screen.getByText('Modo somente leitura')).toBeTruthy();
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
    await waitFor(() =>
      expect(screen.getByText('Bem-vindo de volta')).toBeTruthy(),
    );
    expect(revoked).toBe(true);
    expect(secure.__store.size).toBe(0);
  });

  it('suspended screen still allows logout', async () => {
    await setRefreshToken('rt-1');
    installFetchMock(({ method, path }) =>
      method === 'POST' && path === '/v1/auth/logout'
        ? json(200, { ok: true })
        : null,
    );
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'student', academyStatus: 'suspended' }),
    });
    expect(screen.getByText('Academia suspensa')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sair'));
    });
    await waitFor(() =>
      expect(screen.getByText('Bem-vindo de volta')).toBeTruthy(),
    );
    expect(secure.__store.size).toBe(0);
  });
});
