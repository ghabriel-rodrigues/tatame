/**
 * PLT.10-14 — the plataforma console screens against MSW with the real
 * router and client (web-07): Visão geral (plataforma-02), Academias +
 * Registrar (plataforma-03/08), Academia detalhe (plataforma-04), Planos
 * (plataforma-05/06/07) and Conta / Equipe / Integrações
 * (plataforma-12/10/11).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FIXTURE_PLATFORM_ACADEMIES,
  http,
  makeMeResponse,
  makePlatformAcademyDetail,
  makePlatformMembership,
  makePlatformPlanCatalog,
  platformConsoleHandlers,
  problemResponse,
} from '@tatame/shared/testing';
import type { PlatformRoleName } from '@tatame/shared';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';
import { formatBRLWhole } from '../billing-format';

function renderPlatform(path: string, role: PlatformRoleName = 'owner') {
  const platform = makePlatformMembership({ role });
  return renderRoute(path, {
    session: makeMeResponse({ memberships: [platform], academy: null }),
  });
}

const ALPHA = FIXTURE_PLATFORM_ACADEMIES[0]!;

describe('Visão geral (PLT.10)', () => {
  it('renders the MRR hero with the delta pill, the three tiles and the chart', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma');

    expect(
      await screen.findByRole('heading', { name: 'Visão geral' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(formatBRLWhole(1_924_000)),
    ).toBeInTheDocument();
    expect(screen.getByText('+12% vs. julho')).toBeInTheDocument();

    expect(screen.getByText('97')).toBeInTheDocument();
    expect(screen.getByText('academias')).toBeInTheDocument();
    expect(screen.getByText('4.812')).toBeInTheDocument();
    expect(screen.getByText('alunos na base')).toBeInTheDocument();
    expect(screen.getByText('3,1%')).toBeInTheDocument();
    expect(screen.getByText('inadimplência')).toBeInTheDocument();

    expect(
      screen.getByLabelText('MRR dos últimos 6 meses'),
    ).toBeInTheDocument();
  });

  it('lists "Precisam de atenção" with the PT-BR reasons and opens the academy', async () => {
    server.use(...platformConsoleHandlers());
    const user = userEvent.setup();
    const { router } = renderPlatform('/plataforma');

    expect(await screen.findByText('Precisam de atenção')).toBeInTheDocument();
    expect(screen.getByText('Trial termina em 9 dias')).toBeInTheDocument();
    expect(
      screen.getByText('Assinatura vencida há 12 dias'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Bravo BJJ Team/ }));
    expect(router.state.location.pathname).toBe(
      `/plataforma/academias/${FIXTURE_PLATFORM_ACADEMIES[1]!.id}`,
    );
  });

  it('sends support to Academias instead of a screen its role cannot read', async () => {
    server.use(...platformConsoleHandlers());
    const { router } = renderPlatform('/plataforma', 'support');

    expect(
      await screen.findByRole('heading', { name: 'Academias' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/plataforma/academias');
  });

  it('shows the RBAC denial copy when the overview is refused', async () => {
    server.use(...platformConsoleHandlers());
    server.use(
      http.get('/v1/platform/overview', ({ response }) =>
        response.untyped(problemResponse(403, 'authz.forbidden_role')),
      ),
    );
    renderPlatform('/plataforma', 'finance');

    // retry: 1 delays the error state past the default findBy timeout.
    expect(
      await screen.findByText(
        'Seu perfil não tem acesso à visão geral da plataforma.',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
  });
});

describe('Academias (PLT.11)', () => {
  it('renders the base with city, students, plan and status chips', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/academias');

    expect(
      await screen.findByRole('heading', { name: 'Academias' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('4 escolas, academias e equipes na plataforma.'),
    ).toBeInTheDocument();

    expect(
      await screen.findByText('São Paulo / SP · 214 alunos · plano Pro'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Inadimplente')).toBeInTheDocument();
    expect(screen.getByText('Suspensa')).toBeInTheDocument();
  });

  it('registers an academy and confirms the admin invite went out', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(...platformConsoleHandlers());
    server.use(
      http.post('/v1/platform/academies', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          academy: makePlatformAcademyDetail({
            name: 'Horizonte BJJ',
            status: 'trial',
          }),
          adminUserId: '018f0000-0000-7000-8000-0000000ad001',
          adminUserCreated: true,
          passwordEmailSent: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderPlatform('/plataforma/academias');

    await user.click(
      await screen.findByRole('button', { name: 'Registrar academia' }),
    );
    const sheet = await screen.findByRole('dialog');
    await user.type(
      within(sheet).getByLabelText(/Nome da academia/),
      'Horizonte BJJ',
    );
    await user.type(
      within(sheet).getByLabelText(/Cidade \/ UF/),
      'São Paulo / SP',
    );
    await user.type(
      within(sheet).getByLabelText(/Email do administrador/),
      'admin@horizontebjj.com.br',
    );
    await user.click(within(sheet).getByRole('button', { name: /^Pro/ }));
    await user.click(
      within(sheet).getByRole('button', { name: 'Registrar e convidar admin' }),
    );

    expect(await screen.findByText('Academia registrada')).toBeInTheDocument();
    expect(
      screen.getByText(
        'O admin recebeu o convite por email e já pode configurar a identidade visual.',
      ),
    ).toBeInTheDocument();
    expect(body).toMatchObject({
      name: 'Horizonte BJJ',
      city: 'São Paulo / SP',
      adminEmail: 'admin@horizontebjj.com.br',
    });
  });

  it('hides the register action from roles the API would refuse', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/academias', 'finance');

    await screen.findByRole('heading', { name: 'Academias' });
    expect(
      screen.queryByRole('button', { name: 'Registrar academia' }),
    ).toBeNull();
  });
});

describe('Academia detalhe (PLT.12)', () => {
  it('renders identity, stats and the next-cycle caption on the plan picker', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform(`/plataforma/academias/${ALPHA.id}`);

    expect(
      await screen.findByRole('heading', { name: 'Alpha Jiu-Jitsu' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('São Paulo / SP · desde fev 2024'),
    ).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByText('alunos')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('professores')).toBeInTheDocument();
    expect(
      screen.getByText('A mudança vale a partir do próximo ciclo.'),
    ).toBeInTheDocument();
  });

  it('schedules a plan change and shows the pending banner', async () => {
    const black = makePlatformPlanCatalog().plans[2]!;
    let body: Record<string, unknown> | null = null;
    const pending = makePlatformAcademyDetail({
      pendingPlan: {
        id: black.id,
        name: black.name,
        priceCents: black.priceCents,
      },
    });
    server.use(...platformConsoleHandlers());
    server.use(
      http.put(
        '/v1/platform/academies/{id}/plan',
        async ({ request, response }) => {
          body = (await request.json()) as Record<string, unknown>;
          return response(200).json(pending);
        },
      ),
      // The screen refetches after the write — the detail must agree.
      http.get('/v1/platform/academies/{id}', ({ response }) =>
        response(200).json(pending),
      ),
    );
    const user = userEvent.setup();
    renderPlatform(`/plataforma/academias/${ALPHA.id}`);

    await screen.findByText('A mudança vale a partir do próximo ciclo.');
    await user.click(screen.getByRole('button', { name: /Black/ }));

    expect(body).toEqual({ platformPlanId: black.id });
    expect(
      await screen.findByText('Muda para Black no próximo ciclo.'),
    ).toBeInTheDocument();
  });

  it('flips the suspension button label after suspending', async () => {
    server.use(...platformConsoleHandlers());
    let suspended = false;
    server.use(
      http.post('/v1/platform/academies/{id}/suspend', ({ response }) => {
        suspended = true;
        return response(200).json(
          makePlatformAcademyDetail({ status: 'suspended' }),
        );
      }),
      http.get('/v1/platform/academies/{id}', ({ response }) =>
        response(200).json(
          makePlatformAcademyDetail(suspended ? { status: 'suspended' } : {}),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPlatform(`/plataforma/academias/${ALPHA.id}`);

    await user.click(
      await screen.findByRole('button', { name: 'Suspender academia' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Reativar academia' }),
    ).toBeInTheDocument();
  });

  it('hides "Entrar como admin" from finance, which the API refuses anyway', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform(`/plataforma/academias/${ALPHA.id}`, 'finance');

    await screen.findByRole('heading', { name: 'Alpha Jiu-Jitsu' });
    expect(
      screen.queryByRole('button', { name: 'Entrar como admin da academia' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Suspender academia' }),
    ).toBeNull();
  });
});

describe('Planos (PLT.13)', () => {
  it('renders the derived "Mais assinado" badge and the "Tudo do X" chips', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/planos');

    expect(
      await screen.findByRole('heading', { name: 'Planos' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Mais assinado')).toBeInTheDocument();
    expect(screen.getByText('Tudo do Essencial')).toBeInTheDocument();
    expect(screen.getByText('Tudo do Pro')).toBeInTheDocument();

    expect(
      screen.getByText('Até 80 alunos · 31 academias'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Alunos ilimitados · 14 academias'),
    ).toBeInTheDocument();
    // The cheapest plan inherits nothing, so it shows its own chips.
    expect(screen.getByText('Presença e turmas')).toBeInTheDocument();
  });

  it('creates a plan from the registry toggles and the limit chips', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(...platformConsoleHandlers());
    server.use(
      http.post('/v1/platform/plans', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json(makePlatformPlanCatalog().plans[0]!);
      }),
    );
    const user = userEvent.setup();
    renderPlatform('/plataforma/planos');

    await user.click(await screen.findByRole('button', { name: 'Novo plano' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(/Nome do plano/), 'Master');
    await user.type(within(sheet).getByLabelText(/Preço mensal/), '499,00');
    await user.click(within(sheet).getByRole('button', { name: 'Ilimitado' }));
    await user.click(within(sheet).getByLabelText('Loja da academia'));
    await user.click(
      within(sheet).getByRole('button', { name: 'Criar plano' }),
    );

    expect(body).toEqual({
      name: 'Master',
      priceCents: 49_900,
      studentLimit: null,
      features: ['store'],
    });
    expect(await screen.findByText('Plano criado')).toBeInTheDocument();
    expect(
      screen.getByText(
        'O plano já aparece para novas assinaturas de academias.',
      ),
    ).toBeInTheDocument();
  });

  it('opens the editor with the plan FULL feature set, not just its own chips', async () => {
    server.use(...platformConsoleHandlers());
    const user = userEvent.setup();
    renderPlatform('/plataforma/planos');

    await screen.findByText('Mais assinado');
    // Pro's card shows 4 added chips; its stored set also holds Essencial's 3.
    await user.click(
      screen.getAllByRole('button', { name: 'Editar plano' })[1]!,
    );
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByLabelText('Presença e turmas')).toBeChecked();
    expect(within(sheet).getByLabelText('Loja da academia')).toBeChecked();
    expect(within(sheet).getByLabelText('Multiunidades')).not.toBeChecked();
    expect(
      within(sheet).getByText('Mudanças valem no próximo ciclo das assinantes'),
    ).toBeInTheDocument();
  });

  it('hides the plan writes from non-owner platform roles', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/planos', 'support');

    await screen.findByRole('heading', { name: 'Planos' });
    expect(screen.queryByRole('button', { name: 'Novo plano' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar plano' })).toBeNull();
  });
});

describe('Conta, Equipe e Integrações (PLT.14)', () => {
  it('renders the Conta hub entry rows', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/conta');

    expect(
      await screen.findByRole('heading', { name: 'Conta' }),
    ).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(main.getByText('Equipe da plataforma')).toBeInTheDocument();
    expect(main.getByText('Faturamento e repasses')).toBeInTheDocument();
    expect(main.getByText('Integrações')).toBeInTheDocument();
    expect(main.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('lists the team with role chips and the role explainer', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/equipe');

    expect(
      await screen.findByRole('heading', { name: 'Equipe da plataforma' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('marcos@tatame.app')).toBeInTheDocument();
    // The shell header carries its own role pill, and the footer explains
    // each role by name — assert on the roster chips specifically.
    const roster = within(
      screen.getByText('marcos@tatame.app').closest('div')!.parentElement!,
    );
    expect(roster.getByText('Owner')).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(main.getAllByText('Suporte').length).toBeGreaterThanOrEqual(2);
    expect(main.getAllByText('Financeiro').length).toBeGreaterThanOrEqual(1);
    expect(main.getByText(/controla faturamento e planos/)).toBeInTheDocument();
  });

  it('invites a team member with the chosen role (owner only)', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(...platformConsoleHandlers());
    server.use(
      http.post('/v1/platform/team', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          member: {
            id: '018f0000-0000-7000-8000-0000000tm009',
            userId: '018f0000-0000-7000-8000-0000000us009',
            fullName: 'Nova Pessoa',
            email: 'nova@tatame.app',
            role: 'finance',
            status: 'active',
          },
          userCreated: true,
          passwordEmailSent: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderPlatform('/plataforma/equipe');

    await user.click(await screen.findByRole('button', { name: 'Convidar' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(/Nome/), 'Nova Pessoa');
    await user.type(within(sheet).getByLabelText(/Email/), 'nova@tatame.app');
    await user.click(within(sheet).getByRole('button', { name: 'Financeiro' }));
    await user.click(
      within(sheet).getByRole('button', { name: 'Enviar convite' }),
    );

    expect(body).toEqual({
      fullName: 'Nova Pessoa',
      email: 'nova@tatame.app',
      role: 'finance',
    });
    expect(
      await screen.findByText(
        'Convite enviado por email com papel Financeiro.',
      ),
    ).toBeInTheDocument();
  });

  it('hides Convidar from support', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/equipe', 'support');

    await screen.findByRole('heading', { name: 'Equipe da plataforma' });
    expect(screen.queryByRole('button', { name: 'Convidar' })).toBeNull();
  });

  it('renders the payment rails with disabled switches (the honest stub)', async () => {
    server.use(...platformConsoleHandlers());
    renderPlatform('/plataforma/integracoes');

    expect(
      await screen.findByRole('heading', { name: 'Integrações' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Pix · PSP TatamePay')).toBeInTheDocument();
    expect(
      screen.getByText('Liquidação instantânea · taxa 0,9%'),
    ).toBeInTheDocument();
    for (const name of [
      'Pix · PSP TatamePay',
      'Boleto · registradora',
      'Cartão · adquirente',
    ]) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
  });
});
