/**
 * BIL.14 — Planos de mensalidade (admin-15): catalog list with archived rows
 * dimmed, the Novo plano sheet (recorrência + vencimento chips, custom day),
 * edit + audited archive with confirmation, the plan.name_taken PT-BR
 * mapping, and the student create/edit plan selects posting academyPlanId.
 * Real routes + real client against MSW (web-07).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  billingHandlers,
  enrollmentHandlers,
  http,
  makeEnrollmentRegistry,
  makeMeResponse,
  makeMembership,
  makePlan,
  makePlanCatalog,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';
import { formatBRL, planOptionLabel } from '../billing-format';

const session = () => makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

describe('Planos de mensalidade (BIL.14)', () => {
  it('lists plans with value, due day, recurrence chip and dimmed archived rows', async () => {
    server.use(...billingHandlers());
    renderRoute('/admin/planos', { session: session() });

    expect(
      await screen.findByRole('heading', { name: 'Planos de mensalidade' }),
    ).toBeInTheDocument();
    await screen.findByText('Kids Mensal');
    expect(screen.getByText(`${formatBRL(18_000)} · vence dia 5`)).toBeInTheDocument();
    expect(screen.getByText('Kids Mensal')).toBeInTheDocument();
    expect(screen.getByText(`${formatBRL(15_000)} · vence dia 10`)).toBeInTheDocument();
    // "Mensal" appears as a title + as the recurrence chip on both monthly plans.
    expect(screen.getAllByText('Mensal')).toHaveLength(3);
    // Archived plan: dimmed, "Arquivado" chip, not pressable.
    // ("Trimestral" is both the title and its recurrence chip.)
    expect(screen.getAllByText('Trimestral')).toHaveLength(2);
    expect(screen.getByText('Arquivado')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Trimestral/ }),
    ).not.toBeInTheDocument();
    // Active plans are pressable rows.
    expect(screen.getByRole('button', { name: /^Mensal/ })).toBeInTheDocument();
  });

  it('creates a plan from the Novo plano sheet with recurrence and due-day chips', async () => {
    server.use(...billingHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/billing/plans', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          plan: makePlan({ name: 'Anual Black', amountCents: 250_000 }),
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/planos', { session: session() });
    await screen.findByText('Kids Mensal');

    await user.click(screen.getByRole('button', { name: 'Novo plano' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo plano' });
    await user.type(within(sheet).getByLabelText(/Nome/), 'Anual Black');
    await user.type(within(sheet).getByLabelText(/Valor/), '2.500,00');
    await user.click(within(sheet).getByRole('button', { name: 'Anual' }));
    await user.click(within(sheet).getByRole('button', { name: 'Dia 10' }));
    await user.click(within(sheet).getByRole('button', { name: 'Criar plano' }));

    expect(await screen.findByText('Plano criado.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Anual Black',
      amountCents: 250_000,
      recurrence: 'yearly',
      dueDay: 10,
    });
  });

  it('accepts a custom vencimento day outside the 5/10/15 chips', async () => {
    server.use(...billingHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/billing/plans', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({ plan: makePlan({ name: 'Semestral', dueDay: 8 }) });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/planos', { session: session() });
    await screen.findByText('Kids Mensal');

    await user.click(screen.getByRole('button', { name: 'Novo plano' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo plano' });
    await user.type(within(sheet).getByLabelText(/Nome/), 'Semestral');
    await user.type(within(sheet).getByLabelText(/Valor/), '900');
    await user.click(within(sheet).getByRole('button', { name: 'Semestral' }));
    await user.click(within(sheet).getByRole('button', { name: 'Outro dia' }));
    await user.type(within(sheet).getByLabelText(/Dia do vencimento/), '8');
    await user.click(within(sheet).getByRole('button', { name: 'Criar plano' }));

    expect(await screen.findByText('Plano criado.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Semestral',
      amountCents: 90_000,
      recurrence: 'semiannual',
      dueDay: 8,
    });
  });

  it('maps plan.name_taken to the PT-BR conflict message', async () => {
    server.use(...billingHandlers());
    server.use(
      http.post('/v1/admin/billing/plans', ({ response }) =>
        response.untyped(problemResponse(409, 'plan.name_taken', 'duplicate')),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/planos', { session: session() });
    await screen.findByText('Kids Mensal');

    await user.click(screen.getByRole('button', { name: 'Novo plano' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo plano' });
    await user.type(within(sheet).getByLabelText(/Nome/), 'Mensal');
    await user.type(within(sheet).getByLabelText(/Valor/), '180,00');
    await user.click(within(sheet).getByRole('button', { name: 'Criar plano' }));

    expect(
      await screen.findByText('Já existe um plano com esse nome.'),
    ).toBeInTheDocument();
  });

  it('edits a plan through the row sheet (PATCH with the changed values)', async () => {
    const plans = makePlanCatalog();
    server.use(...billingHandlers({ plans }));
    const mensal = plans[0]!;
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch('/v1/admin/billing/plans/{id}', async ({ params, request, response }) => {
        patched = { id: params.id, body: (await request.json()) as Record<string, unknown> };
        return response(200).json({ plan: { ...mensal, amountCents: 20_000 } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/planos', { session: session() });
    await screen.findByText('Kids Mensal');

    await user.click(screen.getByRole('button', { name: /^Mensal/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar plano' });
    const valor = within(sheet).getByLabelText(/Valor/);
    await user.clear(valor);
    await user.type(valor, '200,00');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar plano' }));

    expect(await screen.findByText('Plano atualizado.')).toBeInTheDocument();
    expect(patched).toEqual({
      id: mensal.id,
      body: { name: 'Mensal', amountCents: 20_000, recurrence: 'monthly', dueDay: 5 },
    });
  });

  it('archives a plan only after the confirmation dialog', async () => {
    const plans = makePlanCatalog();
    server.use(...billingHandlers({ plans }));
    const mensal = plans[0]!;
    let archivedId: string | null = null;
    server.use(
      http.post('/v1/admin/billing/plans/{id}/archive', ({ params, response }) => {
        archivedId = params.id;
        return response(200).json({ plan: { ...mensal, isActive: false } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/planos', { session: session() });
    await screen.findByText('Kids Mensal');

    await user.click(screen.getByRole('button', { name: /^Mensal/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar plano' });
    await user.click(within(sheet).getByRole('button', { name: 'Arquivar plano' }));

    const confirm = await screen.findByRole('dialog', { name: 'Arquivar plano' });
    expect(
      within(confirm).getByText(/Novos alunos não poderão assinar este plano/),
    ).toBeInTheDocument();
    expect(archivedId).toBeNull();

    await user.click(within(confirm).getByRole('button', { name: 'Arquivar' }));
    expect(await screen.findByText('Plano arquivado.')).toBeInTheDocument();
    expect(archivedId).toBe(mensal.id);
  });
});

describe('student plan assignment (BIL.14)', () => {
  it('posts academyPlanId from the Novo aluno plan select', async () => {
    const plans = makePlanCatalog();
    server.use(...enrollmentHandlers());
    server.use(...billingHandlers({ plans }));
    const mensal = plans[0]!;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/students', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          student: {
            id: '018f0000-0000-7000-8001-00000000cafe',
            fullName: 'Aluno Plano',
            birthDate: '2000-01-01',
            status: 'active',
            badge: 'pendente',
            guardianId: null,
            userId: null,
            classes: [],
            academyPlanId: mensal.id,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Criar registro' }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(/Nome completo/), 'Aluno Plano');
    fireEvent.change(within(sheet).getByLabelText(/Data de nascimento/), {
      target: { value: '2000-01-01' },
    });
    await user.click(within(sheet).getByRole('combobox', { name: 'Plano de mensalidade' }));
    await user.click(await screen.findByRole('option', { name: planOptionLabel(mensal) }));
    await user.click(within(sheet).getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('Aluno cadastrado.')).toBeInTheDocument();
    expect(body).toMatchObject({ fullName: 'Aluno Plano', academyPlanId: mensal.id });
  });

  it('patches academyPlanId from the student edit sheet plan select', async () => {
    const registry = makeEnrollmentRegistry();
    const plans = makePlanCatalog();
    server.use(...enrollmentHandlers(registry));
    server.use(...billingHandlers({ plans }));
    const lucas = registry.students[0]!;
    const kidsMensal = plans[1]!;
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch('/v1/admin/students/{id}', async ({ params, request, response }) => {
        patched = { id: params.id, body: (await request.json()) as Record<string, unknown> };
        return response(200).json({
          student: { ...lucas, academyPlanId: kidsMensal.id },
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: /Lucas Almeida/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar aluno' });
    await user.click(within(sheet).getByRole('combobox', { name: 'Plano de mensalidade' }));
    await user.click(
      await screen.findByRole('option', { name: planOptionLabel(kidsMensal) }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cadastro atualizado.')).toBeInTheDocument();
    expect(patched).toEqual({
      id: lucas.id,
      body: { fullName: 'Lucas Almeida', academyPlanId: kidsMensal.id },
    });
  });
});
