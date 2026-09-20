/**
 * ENR.14 — multi-select state machine + atomic "Mover para turma" flow
 * (admin-08/09): count bar, destination occupancy, success toast and the
 * per-student capacity_exceeded detail.
 */
import { screen, within } from '@testing-library/react';
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

function renderCadastros() {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute('/admin/cadastros', {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

async function selectTwoStudents(
  registry: ReturnType<typeof makeEnrollmentRegistry>,
) {
  const user = userEvent.setup();
  renderCadastros();
  await screen.findByText('Lucas Almeida');

  await user.click(screen.getByRole('button', { name: 'Selecionar vários' }));
  await user.click(screen.getByLabelText('Selecionar Lucas Almeida'));
  await user.click(screen.getByLabelText('Selecionar João Ferraz'));
  expect(screen.getByText('2 selecionados')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Mover para turma' }));
  const sheet = await screen.findByRole('dialog', { name: 'Mover 2 alunos' });
  expect(registry.classes.length).toBeGreaterThan(0);
  return { user, sheet };
}

describe('multi-select + mover para turma (ENR.14)', () => {
  it('enters selection mode with checkboxes, live count and cancel', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderCadastros();
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Selecionar vários' }));
    expect(screen.getByText('0 selecionados')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Selecionar Lucas Almeida'));
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('1 selecionado')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Selecionar Lucas Almeida'),
    ).not.toBeInTheDocument();
  });

  it('shows destinations with occupancy and blocks a class without room', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const { sheet } = await selectTwoStudents(registry);

    // Fundamentos is Lotada (24/24) — rendered but not pressable.
    expect(within(sheet).getByText('Fundamentos')).toBeInTheDocument();
    expect(within(sheet).getByText('Lotada')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: /Fundamentos/ }),
    ).not.toBeInTheDocument();

    // Avançada has 4 free slots — pressable, with occupancy in the row.
    expect(
      within(sheet).getByRole('button', { name: /Avançada/ }),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(/16\/20/)).toBeInTheDocument();
  });

  it('moves the selection atomically and toasts success', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const destination = registry.classes[1]!; // Avançada
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/students/move', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(200).json({
          destinationClassId: destination.id,
          movedStudentIds: (body['studentIds'] as string[]) ?? [],
        });
      }),
    );

    const { user, sheet } = await selectTwoStudents(registry);
    await user.click(within(sheet).getByRole('button', { name: /Avançada/ }));

    expect(
      await screen.findByText('2 alunos movidos para Avançada.'),
    ).toBeInTheDocument();
    expect(body).toMatchObject({
      destinationClassId: destination.id,
      studentIds: [registry.students[0]!.id, registry.students[3]!.id],
    });
    // Selection mode exits after an atomic success.
    expect(screen.queryByText('2 selecionados')).not.toBeInTheDocument();
  });

  it('renders the capacity_exceeded rejection with per-student detail in PT-BR', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const lucas = registry.students[0]!;
    const joao = registry.students[3]!;
    server.use(
      http.post('/v1/admin/students/move', ({ response }) =>
        response.untyped(
          new Response(
            JSON.stringify({
              type: 'https://tatame.app/problems/class.capacity_exceeded',
              title: 'class.capacity_exceeded',
              status: 409,
              code: 'class.capacity_exceeded',
              detail: 'Destination has 0 free slot(s) for 2 student(s)',
              errors: [
                {
                  field: lucas.id,
                  messages: ['No seat available in the destination class'],
                },
                {
                  field: joao.id,
                  messages: ['No seat available in the destination class'],
                },
              ],
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          ),
        ),
      ),
    );

    const { user, sheet } = await selectTwoStudents(registry);
    await user.click(within(sheet).getByRole('button', { name: /Avançada/ }));

    expect(
      await screen.findByText(
        'A turma de destino não tem vagas para todos os alunos selecionados.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Lucas Almeida: sem vaga na turma de destino.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('João Ferraz: sem vaga na turma de destino.'),
    ).toBeInTheDocument();
    // The atomic failure keeps the selection intact for a retry.
    expect(
      screen.getByRole('dialog', { name: 'Mover 2 alunos' }),
    ).toBeInTheDocument();
  });
});
