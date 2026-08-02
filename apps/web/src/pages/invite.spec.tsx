/**
 * AUTH.16 convite flow states (web-07): valid landing, expired link,
 * email-exists → login prompt, and the happy signup ending logged in.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  defaultHandlers,
  http,
  makeAuthSession,
  makeInviteLanding,
  makeMeResponse,
  makeMembership,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../test/render-route';
import { server } from '../test/setup';

const TOKEN = 'invite-token-123';

describe('convite flow', () => {
  it('renders the branded landing with the inherited bindings', async () => {
    server.use(
      http.get('/v1/public/invites/{token}', ({ response }) =>
        response(200).json(makeInviteLanding()),
      ),
    );

    renderRoute(`/convite/${TOKEN}`);

    expect(
      await screen.findByText(/Você foi convidado para treinar na Alpha Jiu-Jitsu/),
    ).toBeInTheDocument();
    expect(screen.getByText('Turma vinculada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar convite' })).toBeInTheDocument();
  });

  it('shows the friendly error state for an expired or used-up link', async () => {
    server.use(
      http.get('/v1/public/invites/{token}', ({ response }) =>
        response.untyped(problemResponse(410, 'invite.invalid_or_expired', 'Invite is expired')),
      ),
    );

    renderRoute(`/convite/${TOKEN}`);

    expect(await screen.findByText('Convite indisponível')).toBeInTheDocument();
    expect(screen.getByText(/Este convite expirou ou já foi utilizado/)).toBeInTheDocument();
  });

  it('shows the not-found error state for an unknown link', async () => {
    server.use(
      http.get('/v1/public/invites/{token}', ({ response }) =>
        response.untyped(problemResponse(404, 'invite.invalid_or_expired', 'Invite not found')),
      ),
    );

    renderRoute(`/convite/${TOKEN}`);

    expect(await screen.findByText('Convite indisponível')).toBeInTheDocument();
    expect(screen.getByText(/Não encontramos este convite/)).toBeInTheDocument();
  });

  async function fillSignup() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    await user.type(screen.getByLabelText('Nome completo'), 'Novo Aluno');
    await user.type(screen.getByLabelText('Email'), 'novo@tatame.dev');
    await user.type(screen.getByLabelText('Criar senha'), 'SenhaForte!123');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Resumo do vínculo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar conta e entrar' }));
    return user;
  }

  it('completes the signup and ends logged in (success screen)', async () => {
    const student = makeMembership({ role: 'student' });
    server.use(
      http.get('/v1/public/invites/{token}', ({ response }) =>
        response(200).json(makeInviteLanding()),
      ),
      http.post('/v1/public/invites/{token}/accept', ({ response }) =>
        response(201).json({
          ...makeAuthSession({
            memberships: [student],
            user: { email: 'novo@tatame.dev', fullName: 'Novo Aluno' },
          }),
          refreshToken: 'body-refresh-token',
        }),
      ),
      http.get('/v1/auth/me', ({ response }) =>
        response(200).json(
          makeMeResponse({
            memberships: [student],
            user: { email: 'novo@tatame.dev', fullName: 'Novo Aluno' },
          }),
        ),
      ),
    );

    const { router } = renderRoute(`/convite/${TOKEN}`);
    const user = await fillSignup();

    expect(await screen.findByText('Bem-vindo ao tatame')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/baixe-o-app'));
  });

  it('409 email-exists routes through the login prompt path', async () => {
    server.use(
      http.get('/v1/public/invites/{token}', ({ response }) =>
        response(200).json(makeInviteLanding()),
      ),
      http.post('/v1/public/invites/{token}/accept', ({ response }) =>
        response.untyped(problemResponse(409, 'invite.email_exists')),
      ),
    );

    const { router } = renderRoute(`/convite/${TOKEN}`);
    const user = await fillSignup();

    expect(await screen.findByText('Você já tem conta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entrar e aceitar convite' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe(
      `?next=${encodeURIComponent(`/convite/${TOKEN}`)}`,
    );
  });

  it('authenticated visitor accepts by attaching the membership to the account', async () => {
    const admin = makeMembership({ role: 'admin' });
    const session = makeMeResponse({ memberships: [admin] });
    server.use(
      http.get('/v1/public/invites/{token}', ({ response }) =>
        response(200).json(makeInviteLanding()),
      ),
      http.post('/v1/invites/{token}/accept', ({ response }) =>
        response(201).json({
          membershipId: '018f0000-0000-7000-8000-00000000fff1',
          tenantId: '018f0000-0000-7000-8000-00000000a1fa',
          role: 'student',
        }),
      ),
      ...defaultHandlers(),
    );

    renderRoute(`/convite/${TOKEN}`, { session });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: `Aceitar como ${session.user.fullName}` }),
    );

    expect(await screen.findByText('Bem-vindo ao tatame')).toBeInTheDocument();
  });
});
