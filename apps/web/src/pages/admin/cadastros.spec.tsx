/**
 * ENR.13 — Cadastros segments, badges, search and FAB creation forms
 * (admin-07/12). Real routes + real client against MSW (web-07).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  enrollmentHandlers,
  http,
  makeEnrollmentRegistry,
  makeMeResponse,
  makeMembership,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

function renderCadastros(path = '/admin/cadastros') {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute(path, {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

describe('Cadastros — segments (ENR.13)', () => {
  it('renders the alunos segment with derived Ativo/Pendente badges', async () => {
    server.use(...enrollmentHandlers());
    renderCadastros();

    expect(await screen.findByText('Lucas Almeida')).toBeInTheDocument();
    expect(screen.getByText('Pedro Silveira')).toBeInTheDocument();
    expect(screen.getAllByText('Ativo')).toHaveLength(3);
    expect(screen.getAllByText('Pendente')).toHaveLength(2);
    expect(screen.getByText(/5 alunos no total/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alunos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches segments: professores, responsáveis and turmas render their lists', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('tab', { name: 'Professores' }));
    expect(await screen.findByText('Rafael Nunes')).toBeInTheDocument();
    expect(screen.getByText('rafael@tatame.dev')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Responsáveis' }));
    expect(await screen.findByText('Fernanda Silveira')).toBeInTheDocument();
    expect(screen.getByText('1 dependente')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Turmas' }));
    expect(await screen.findByText('Fundamentos')).toBeInTheDocument();
    expect(
      screen.getByText(/Seg · Qua · Sex 19:00 · Prof\. Rafael Nunes · 24\/24/),
    ).toBeInTheDocument();
    expect(screen.getByText('Lotada')).toBeInTheDocument();
  });

  it('filters the current segment by name via the search field', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.type(screen.getByLabelText('Buscar'), 'marina');
    expect(screen.getByText('Marina Costa')).toBeInTheDocument();
    expect(screen.queryByText('Lucas Almeida')).not.toBeInTheDocument();
  });
});

describe('Cadastros — FAB creation forms (ENR.13)', () => {
  it('refuses creating a minor student without a guardian (minor ⇒ guardian)', async () => {
    server.use(...enrollmentHandlers());
    let posted = false;
    server.use(
      http.post('/v1/admin/students', ({ response }) => {
        posted = true;
        return response.untyped(new Response(null, { status: 500 }));
      }),
    );
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Criar registro' }));
    await user.type(
      await screen.findByLabelText(/Nome completo/),
      'Caio Menor',
    );
    fireEvent.change(screen.getByLabelText(/Data de nascimento/), {
      target: { value: '2015-06-10' },
    });
    await user.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));

    expect(
      await screen.findByText(
        'Aluno menor de idade precisa de um responsável vinculado.',
      ),
    ).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('creates a minor student once a guardian is picked and toasts success', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/students', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          student: {
            id: '018f0000-0000-7000-8001-00000000cafe',
            fullName: 'Caio Menor',
            birthDate: '2015-06-10',
            status: 'active',
            badge: 'pendente',
            guardianId: registry.guardians[0]!.id,
            userId: null,
            classes: [],
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Criar registro' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(
      within(sheet).getByLabelText(/Nome completo/),
      'Caio Menor',
    );
    fireEvent.change(within(sheet).getByLabelText(/Data de nascimento/), {
      target: { value: '2015-06-10' },
    });
    await user.click(within(sheet).getAllByRole('combobox')[0]!);
    await user.click(
      await screen.findByRole('option', { name: 'Fernanda Silveira' }),
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Cadastrar aluno' }),
    );

    expect(await screen.findByText('Aluno cadastrado.')).toBeInTheDocument();
    expect(body).toMatchObject({
      fullName: 'Caio Menor',
      birthDate: '2015-06-10',
      guardianId: registry.guardians[0]!.id,
    });
  });

  it('registers a professor and announces the set-password email', async () => {
    server.use(...enrollmentHandlers());
    server.use(
      http.post('/v1/admin/professors', ({ response }) =>
        response(201).json({
          userId: '018f0000-0000-7000-8004-00000000beef',
          membershipId: '018f0000-0000-7000-8003-00000000beef',
          userCreated: true,
          passwordEmailSent: true,
        }),
      ),
    );
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('tab', { name: 'Professores' }));
    await screen.findByText('Rafael Nunes');
    await user.click(screen.getByRole('button', { name: 'Criar registro' }));

    const sheet = await screen.findByRole('dialog');
    await user.type(
      within(sheet).getByLabelText(/Nome completo/),
      'Carla Prof',
    );
    await user.type(within(sheet).getByLabelText(/Email/), 'carla@tatame.dev');
    await user.click(
      within(sheet).getByRole('button', { name: 'Cadastrar professor' }),
    );

    expect(
      await screen.findByText(
        'Professor cadastrado. Enviamos um email para definir a senha.',
      ),
    ).toBeInTheDocument();
  });

  it('creates a guardian from the responsáveis segment', async () => {
    server.use(...enrollmentHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/guardians', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          guardian: {
            id: '018f0000-0000-7000-8002-00000000cafe',
            fullName: 'Paula Mãe',
            phone: null,
            email: null,
            badge: 'pendente',
            userId: null,
            dependentCount: 0,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('tab', { name: 'Responsáveis' }));
    await screen.findByText('Fernanda Silveira');
    await user.click(screen.getByRole('button', { name: 'Criar registro' }));

    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(/Nome completo/), 'Paula Mãe');
    await user.click(
      within(sheet).getByRole('button', { name: 'Cadastrar responsável' }),
    );

    expect(
      await screen.findByText('Responsável cadastrado.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(body).toMatchObject({ fullName: 'Paula Mãe' }));
  });
});
