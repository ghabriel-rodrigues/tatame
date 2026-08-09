/**
 * GRD.14 — registry belt exposure: "Faixa azul · 2 graus" subtitles on
 * student rows (admin-07), the optional initial-belt select on the aluno
 * form (enabled belts only) and the graduation-history drawer with the
 * audited Revogar (revocation rows distinct, single reversal enforced).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  catalogBelt,
  enrollmentHandlers,
  graduationHandlers,
  http,
  makeBeltView,
  makeEnrollmentRegistry,
  makeGraduationHistory,
  makeMeResponse,
  makeMembership,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

function renderCadastros() {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute('/admin/cadastros', {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

describe('registry belt chips (GRD.14)', () => {
  it('renders derived belt subtitles on student rows per admin-07', async () => {
    server.use(...enrollmentHandlers());
    renderCadastros();

    expect(await screen.findByText('Faixa azul · 2 graus · Fundamentos')).toBeInTheDocument();
    expect(screen.getByText('Faixa roxa · 1 grau · Avançada')).toBeInTheDocument();
    expect(screen.getByText('Faixa cinza · Kids')).toBeInTheDocument();
    expect(screen.getByText('Faixa branca · Fundamentos')).toBeInTheDocument();
  });

  it('keeps the plain subtitle for students without the belt payload', async () => {
    const registry = makeEnrollmentRegistry();
    const student = registry.students[0]!;
    delete student.belt;
    student.classes = [];
    server.use(...enrollmentHandlers(registry));
    renderCadastros();

    expect(await screen.findByText('Lucas Almeida')).toBeInTheDocument();
    expect(screen.getByText('Sem turma')).toBeInTheDocument();
  });
});

describe('initial-belt select on the aluno form (GRD.14)', () => {
  it('offers enabled belts only and posts initialBeltId', async () => {
    server.use(...enrollmentHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/students', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          student: {
            id: '018f0000-0000-7000-8001-00000000cafe',
            fullName: 'Tereza Transferida',
            birthDate: '1999-01-05',
            status: 'active',
            badge: 'pendente',
            guardianId: null,
            userId: null,
            classes: [],
            belt: makeBeltView('Azul'),
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Criar registro' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo aluno' });
    await user.type(within(sheet).getByLabelText(/Nome completo/), 'Tereza Transferida');
    fireEvent.change(within(sheet).getByLabelText(/Data de nascimento/), {
      target: { value: '1999-01-05' },
    });
    // Second combobox is the Faixa inicial select (guardian comes first).
    await user.click(within(sheet).getAllByRole('combobox')[1]!);
    // Laranja is disabled in the seeded régua — never a valid initial belt.
    expect(screen.queryByRole('option', { name: 'Faixa laranja' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Faixa azul' }));
    await user.click(within(sheet).getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('Aluno cadastrado.')).toBeInTheDocument();
    expect(body).toMatchObject({
      fullName: 'Tereza Transferida',
      birthDate: '1999-01-05',
      initialBeltId: catalogBelt('Azul').beltId,
    });
  });
});

describe('graduation-history drawer + Revogar (GRD.14)', () => {
  function seedHistory() {
    const registry = makeEnrollmentRegistry();
    const lucas = registry.students[0]!;
    const history = makeGraduationHistory();
    server.use(
      ...enrollmentHandlers(registry),
      ...graduationHandlers({ histories: { [lucas.id]: history } }),
    );
    return { lucas, history };
  }

  async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
    renderCadastros();
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('button', { name: /Lucas Almeida/ }));
    await screen.findByRole('dialog', { name: 'Editar aluno' });
    await user.click(screen.getByRole('button', { name: 'Ver graduações' }));
    return screen.findByRole('dialog', { name: 'Graduações de Lucas Almeida' });
  }

  it('renders the immutable timeline with revocation rows distinct', async () => {
    seedHistory();
    const user = userEvent.setup();
    const drawer = await openDrawer(user);

    expect(within(drawer).getByText('Promoção · Faixa azul')).toBeInTheDocument();
    expect(within(drawer).getByText('1º grau · Faixa azul')).toBeInTheDocument();
    expect(within(drawer).getByText('2º grau · Faixa azul')).toBeInTheDocument();
    // The compensation row and the reversed award read differently.
    expect(within(drawer).getByText('Revogação')).toBeInTheDocument();
    expect(within(drawer).getByText('Revogada')).toBeInTheDocument();
    // Who/when survive on every entry (immutable history).
    expect(within(drawer).getByText(/15\/01\/2026 · por Rafael Nunes/)).toBeInTheDocument();
    expect(within(drawer).getByText(/por Amanda Admin · Lançamento incorreto\./)).toBeInTheDocument();
    // Revogar only on non-reversed awards: promotion + 1º grau.
    expect(within(drawer).getAllByRole('button', { name: 'Revogar' })).toHaveLength(2);
  });

  it('revokes an award after confirmation and posts the audited reason', async () => {
    const { history } = seedHistory();
    let revoked: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.post('/v1/admin/graduations/{id}/revoke', async ({ params, request, response }) => {
        revoked = { id: params.id, body: (await request.json()) as Record<string, unknown> };
        return response(200).json({
          status: 'revoked',
          graduationId: params.id,
          revocationId: '018f0000-0000-7000-8011-00000000beef',
          belt: makeBeltView('Azul'),
        });
      }),
    );
    const user = userEvent.setup();
    const drawer = await openDrawer(user);

    // First Revogar targets the newest revocable award (1º grau).
    await user.click(within(drawer).getAllByRole('button', { name: 'Revogar' })[0]!);
    const confirm = await screen.findByRole('dialog', { name: 'Revogar graduação' });
    await user.type(
      within(confirm).getByLabelText(/Motivo/),
      'Grau lançado para o aluno errado.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Revogar' }));

    expect(await screen.findByText('Graduação revogada.')).toBeInTheDocument();
    // history[2] is the valid 1º grau (0 = revocation row, 1 = reversed award).
    expect(revoked!.id).toBe(history[2]!.id);
    expect(revoked!.body).toMatchObject({ reason: 'Grau lançado para o aluno errado.' });
  });

  it('maps graduation.already_reversed to PT-BR (single reversal rule)', async () => {
    seedHistory();
    server.use(
      http.post('/v1/admin/graduations/{id}/revoke', ({ response }) =>
        response.untyped(problemResponse(409, 'graduation.already_reversed', 'already reversed')),
      ),
    );
    const user = userEvent.setup();
    const drawer = await openDrawer(user);

    await user.click(within(drawer).getAllByRole('button', { name: 'Revogar' })[0]!);
    const confirm = await screen.findByRole('dialog', { name: 'Revogar graduação' });
    await user.click(within(confirm).getByRole('button', { name: 'Revogar' }));

    expect(await screen.findByText('Esta graduação já foi revogada.')).toBeInTheDocument();
  });
});
