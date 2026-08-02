/**
 * AUTH.12 login flows (web-07): success with a single membership, the
 * multi-academy chooser, invalid credentials, and the platform TOTP step.
 * Real routes + real client against MSW; assertions on what the user sees.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HttpResponse,
  rawHttp as mswHttp,
  defaultHandlers,
  http,
  makeAuthSession,
  makeMeResponse,
  makeMembership,
  makePlatformMembership,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../test/render-route';
import { server } from '../test/setup';

async function fillCredentials(email = 'admin@tatame.dev', password = 'TatameDev!123') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

describe('login page', () => {
  it('logs in a single-membership admin and lands on /admin', async () => {
    const admin = makeMembership({ role: 'admin' });
    const session = makeAuthSession({ memberships: [admin] });
    server.use(
      ...defaultHandlers({
        session: { memberships: [admin] },
        me: { memberships: [admin] },
      }),
    );

    const { router } = renderRoute('/login');
    await fillCredentials();

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(await screen.findByText('Em construção')).toBeInTheDocument();
    expect(session.activeMembershipId).toBe(admin.id);
  });

  it('shows the inline PT-BR error for invalid credentials', async () => {
    server.use(
      http.post('/v1/auth/login', ({ response }) =>
        response.untyped(
          problemResponse(401, 'auth.invalid_credentials', 'Invalid email or password'),
        ),
      ),
    );

    const { router } = renderRoute('/login');
    await fillCredentials('admin@tatame.dev', 'senha-errada');

    expect(await screen.findByText('Email ou senha inválidos.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('walks the platform TOTP challenge to the plataforma console', async () => {
    const platform = makePlatformMembership();
    server.use(
      mswHttp.post('http://localhost/v1/auth/login', () =>
        HttpResponse.json(
          { mfaRequired: true, challengeToken: 'challenge-token' },
          { status: 202 },
        ),
      ),
      http.post('/v1/auth/login/totp', ({ response }) =>
        response(200).json(makeAuthSession({ memberships: [platform] })),
      ),
      http.get('/v1/auth/me', ({ response }) =>
        response(200).json(makeMeResponse({ memberships: [platform], academy: null })),
      ),
    );

    const { router } = renderRoute('/login');
    const user = await fillCredentials('owner@tatame.dev');

    expect(await screen.findByText('Verificação em duas etapas')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/plataforma'));
    expect(await screen.findByText('Console da plataforma')).toBeInTheDocument();
  });

  it('rejects a wrong TOTP code with the inline error', async () => {
    server.use(
      mswHttp.post('http://localhost/v1/auth/login', () =>
        HttpResponse.json(
          { mfaRequired: true, challengeToken: 'challenge-token' },
          { status: 202 },
        ),
      ),
      http.post('/v1/auth/login/totp', ({ response }) =>
        response.untyped(problemResponse(401, 'auth.mfa_invalid_code')),
      ),
    );

    renderRoute('/login');
    const user = await fillCredentials('owner@tatame.dev');

    expect(await screen.findByText('Verificação em duas etapas')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Código inválido. Tente novamente.')).toBeInTheDocument();
  });

  it('offers the academy chooser for multi-admin accounts and switches on pick', async () => {
    const student = makeMembership({ role: 'student' });
    const adminAlpha = makeMembership({ role: 'admin', academyName: 'Alpha Jiu-Jitsu' });
    const adminBravo = makeMembership({ role: 'admin', academyName: 'Bravo BJJ Team' });
    const memberships = [student, adminAlpha, adminBravo];
    let switchedTo: string | null = null;

    server.use(
      http.post('/v1/auth/login', ({ response }) =>
        response(200).json(
          makeAuthSession({ memberships, activeMembershipId: student.id }),
        ),
      ),
      http.post('/v1/auth/switch', async ({ request, response }) => {
        const body = await request.json();
        switchedTo = body.membershipId;
        return response(200).json({
          accessToken: 'switched-access-token',
          accessExpiresIn: 900,
          activeMembershipId: body.membershipId,
        });
      }),
      http.get('/v1/auth/me', ({ response }) =>
        response(200).json(
          makeMeResponse({
            memberships,
            activeMembershipId: switchedTo ?? student.id,
          }),
        ),
      ),
    );

    const { router } = renderRoute('/login');
    const user = await fillCredentials('multi@tatame.dev');

    expect(await screen.findByText('Escolha a academia')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Bravo BJJ Team · Admin/ }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(switchedTo).toBe(adminBravo.id);
  });
});
