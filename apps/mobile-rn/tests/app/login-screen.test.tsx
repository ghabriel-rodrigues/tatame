/**
 * Login screen states (AUTH.17): PT-BR problem+json mapping, the
 * multi-membership chooser, the platform-staff (TOTP) console-web notice,
 * and the full login -> role-gated shell handoff.
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
import { sessionTestApi } from '../../src/session/session-store';
import {
  installFetchMock,
  json,
  makeMe,
  makeMembership,
  problem,
  type FetchHandler,
} from '../helpers/session';

jest.useFakeTimers();

const secure = SecureStore as unknown as {
  __store: Map<string, string>;
  __reset: () => void;
};

function renderLogin(handler: FetchHandler) {
  installFetchMock(handler);
  sessionTestApi.seed({ status: 'anon', session: null });
  const utils = renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return utils;
}

async function submit(email: string, password: string): Promise<void> {
  fireEvent.changeText(screen.getByPlaceholderText('Email'), email);
  fireEvent.changeText(screen.getByPlaceholderText('Senha'), password);
  await act(async () => {
    fireEvent.press(screen.getByText('Entrar'));
  });
}

describe('login screen', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('renders the handoff composition (logo, fields, CTA, invite notice)', () => {
    renderLogin(() => null);
    expect(screen.getByText('Bem-vindo de volta')).toBeTruthy();
    expect(
      screen.getByText('Entre para acompanhar seus treinos.'),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('Senha')).toBeTruthy();
    expect(screen.getByText('Esqueci minha senha')).toBeTruthy();
    expect(screen.getByText('Criar conta')).toBeTruthy();
    expect(screen.getByTestId('invite-notice')).toBeTruthy();
    expect(screen.getByText(/link de convite/)).toBeTruthy();
  });

  it('maps invalid credentials to the PT-BR error', async () => {
    renderLogin(({ method, path }) =>
      method === 'POST' && path === '/v1/auth/login'
        ? problem(401, 'auth.invalid_credentials')
        : null,
    );
    await submit('aluno@tatame.dev', 'wrong');
    await waitFor(() =>
      expect(screen.getByText('Email ou senha inválidos.')).toBeTruthy(),
    );
  });

  it('logs in with body transport and lands on the role-gated shell', async () => {
    const me = makeMe({ role: 'student' });
    renderLogin(({ method, path, body }) => {
      if (method === 'POST' && path === '/v1/auth/login') {
        expect(body).toMatchObject({
          email: 'aluno@tatame.dev',
          password: 'TatameDev!123',
          transport: 'body',
        });
        return json(200, {
          user: {
            id: me.user.id,
            email: me.user.email,
            fullName: me.user.fullName,
          },
          memberships: me.memberships,
          activeMembershipId: me.activeMembershipId,
          accessToken: 'at-1',
          accessExpiresIn: 900,
          refreshToken: 'rt-1',
        });
      }
      if (method === 'GET' && path === '/v1/auth/me') return json(200, me);
      return null;
    });
    await submit('aluno@tatame.dev', 'TatameDev!123');
    await waitFor(() => expect(screen.getByText('Olá, Lucas')).toBeTruthy());
    // The refresh token was persisted through the TokenStore (AUTH.18).
    expect(secure.__store.get('tatame.refreshToken')).toBe('rt-1');
  });

  it('shows the membership chooser when the account has multiple vinculos', async () => {
    const student = makeMembership({ role: 'student' });
    const professor = makeMembership({
      role: 'professor',
      academyName: 'Bravo BJJ Team',
      academySlug: 'bravo-bjj',
    });
    renderLogin(({ method, path }) => {
      if (method === 'POST' && path === '/v1/auth/login') {
        return json(200, {
          user: {
            id: 'u1',
            email: 'multi@tatame.dev',
            fullName: 'Multi Persona',
          },
          memberships: [student, professor],
          activeMembershipId: student.id,
          accessToken: 'at-1',
          accessExpiresIn: 900,
          refreshToken: 'rt-1',
        });
      }
      return null;
    });
    await submit('multi@tatame.dev', 'TatameDev!123');
    await waitFor(() =>
      expect(screen.getByText('Escolha seu perfil')).toBeTruthy(),
    );
    expect(screen.getByText('Alpha Jiu-Jitsu · Aluno')).toBeTruthy();
    expect(screen.getByText('Bravo BJJ Team · Professor')).toBeTruthy();
  });

  it('routes a TOTP challenge (platform staff) to the console-web notice', async () => {
    renderLogin(({ method, path }) =>
      method === 'POST' && path === '/v1/auth/login'
        ? json(200, { mfaRequired: true, challengeToken: 'challenge-1' })
        : null,
    );
    await submit('owner@tatame.dev', 'TatameDev!123');
    await waitFor(() =>
      expect(screen.getByText('Use o console web')).toBeTruthy(),
    );
    expect(screen.getByText('Voltar ao login')).toBeTruthy();
    // Back to credentials.
    await act(async () => {
      fireEvent.press(screen.getByText('Voltar ao login'));
    });
    expect(screen.getByText('Bem-vindo de volta')).toBeTruthy();
  });

  it('navigates to the "Esqueci minha senha" stub screen', async () => {
    renderLogin(() => null);
    await act(async () => {
      fireEvent.press(screen.getByText('Esqueci minha senha'));
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          'Informe seu email e enviaremos as instruções de redefinição.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Enviar instruções')).toBeTruthy();
  });
});
