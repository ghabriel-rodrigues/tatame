/**
 * Role-gated navigation (AUTH.19, rn-02): the root Stack.Protected guards
 * land each session exactly in its surface — login for anon, one persona
 * shell per mobile role, console-only for web-only roles, and the
 * suspended blocking screen.
 */

import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import {
  sessionTestApi,
  type SessionState,
} from '../../src/session/session-store';
import { installFetchMock, makeMe, makeMembership } from '../helpers/session';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderApp(state: SessionState) {
  sessionTestApi.seed(state);
  const utils = renderRouter('src/app');
  // Pass the splash minimum (~1.9s handoff auto-advance).
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return utils;
}

describe('role gate', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
    installFetchMock(() => null);
  });

  it('anon lands on the login screen', () => {
    renderApp({ status: 'anon', session: null });
    expect(screen.getByText('Bem-vindo de volta')).toBeTruthy();
  });

  it('student lands on the aluno shell home', () => {
    renderApp({ status: 'authed', session: makeMe({ role: 'student' }) });
    expect(screen.getByText('Olá, Lucas')).toBeTruthy();
    expect(screen.getByLabelText('Check-in')).toBeTruthy();
  });

  it('professor lands on the professor shell with the chamada FAB', () => {
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'professor', fullName: 'Rafa Mendes' }),
    });
    // Dashboard greeting is time-of-day aware ("Bom dia/Boa tarde/Boa noite").
    expect(screen.getByText(/, Rafa$/)).toBeTruthy();
    expect(screen.getByLabelText('Chamada')).toBeTruthy();
    expect(screen.getByLabelText('Turmas')).toBeTruthy();
  });

  it('guardian lands on the responsavel shell', () => {
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'guardian', fullName: 'Carla Almeida' }),
    });
    expect(screen.getByText('Olá, Carla')).toBeTruthy();
    expect(screen.getByLabelText('Cadastrar filho')).toBeTruthy();
    expect(screen.getByLabelText('Pagamentos')).toBeTruthy();
  });

  it('admin (web-only persona) gets the console-web screen', () => {
    renderApp({
      status: 'authed',
      session: makeMe({
        role: 'admin',
        memberships: [makeMembership({ role: 'admin' })],
      }),
    });
    expect(screen.getByText('Use o console web')).toBeTruthy();
    expect(screen.getByText('Sair')).toBeTruthy();
  });

  it('platform owner gets the console-web screen', () => {
    renderApp({
      status: 'authed',
      session: makeMe({
        role: 'owner',
        memberships: [
          makeMembership({
            role: 'owner',
            type: 'platform',
            tenantId: null,
            academyName: null,
          }),
        ],
      }),
    });
    expect(screen.getByText('Use o console web')).toBeTruthy();
  });

  it('suspended academy blocks into the suspended screen with logout', () => {
    renderApp({
      status: 'authed',
      session: makeMe({ role: 'student', academyStatus: 'suspended' }),
    });
    expect(screen.getByText('Academia suspensa')).toBeTruthy();
    expect(screen.getByText('Sair')).toBeTruthy();
    expect(screen.queryByText('Olá, Lucas')).toBeNull();
  });
});
