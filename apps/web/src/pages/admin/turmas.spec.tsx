/**
 * ENR.15 + ATT.14 — turmas list (admin-10), nova turma recorrente (admin-12)
 * and turma detail (admin-11): schedule chips, server-derived occupancy,
 * session list with attendance counts and the frequência média tile,
 * roster add/remove with capacity errors.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  enrollmentHandlers,
  http,
  makeAdminSession,
  makeClassDetail,
  makeEnrollmentRegistry,
  makeMeResponse,
  makeMembership,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const admin = () => makeMembership({ role: 'admin' });

describe('turmas list + nova turma (ENR.15)', () => {
  it('lists turmas with schedule summary, occupancy and the Lotada chip', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('tab', { name: 'Turmas' }));

    expect(await screen.findByText('Fundamentos')).toBeInTheDocument();
    expect(
      screen.getByText('Seg · Qua · Sex 19:00 · Prof. Rafael Nunes · 24/24'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ter · Qui 18:00 · Prof. Ana Souza · 14/16')).toBeInTheDocument();
    expect(screen.getAllByText('Lotada')).toHaveLength(1);
  });

  it('requires at least one weekday chip on the nova turma form', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('tab', { name: 'Turmas' }));
    await screen.findByText('Fundamentos');
    await user.click(screen.getByRole('button', { name: 'Criar registro' }));

    const sheet = await screen.findByRole('dialog', { name: 'Nova turma' });
    await user.type(within(sheet).getByLabelText(/Nome da turma/), 'Iniciantes');
    await user.click(within(sheet).getAllByRole('combobox')[0]!);
    await user.click(await screen.findByRole('option', { name: 'Rafael Nunes' }));
    await user.click(within(sheet).getByRole('button', { name: 'Criar turma' }));

    expect(
      await screen.findByText('Selecione pelo menos um dia da semana.'),
    ).toBeInTheDocument();
  });

  it('fans selected weekdays out into schedule slots on submit', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/classes', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({ class: makeClassDetail({ name: 'Iniciantes' }) });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('tab', { name: 'Turmas' }));
    await screen.findByText('Fundamentos');
    await user.click(screen.getByRole('button', { name: 'Criar registro' }));

    const sheet = await screen.findByRole('dialog', { name: 'Nova turma' });
    await user.type(within(sheet).getByLabelText(/Nome da turma/), 'Iniciantes');
    await user.click(within(sheet).getByRole('button', { name: 'Seg' }));
    await user.click(within(sheet).getByRole('button', { name: 'Qua' }));
    fireEvent.change(within(sheet).getByLabelText(/Hora de início/), {
      target: { value: '18:30' },
    });
    await user.click(within(sheet).getAllByRole('combobox')[0]!);
    await user.click(await screen.findByRole('option', { name: 'Ana Souza' }));
    await user.click(within(sheet).getByRole('button', { name: 'Criar turma' }));

    expect(await screen.findByText('Turma criada.')).toBeInTheDocument();
    expect(body).toMatchObject({
      name: 'Iniciantes',
      professorUserId: registry.professors[1]!.userId,
      capacity: 20,
      schedules: [
        { weekday: 1, startTime: '18:30', durationMinutes: 60 },
        { weekday: 3, startTime: '18:30', durationMinutes: 60 },
      ],
    });
  });
});

describe('turma detail (ENR.15)', () => {
  it('renders schedule chips, occupancy, the sessions empty state and the roster', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const fundamentos = registry.classes[0]!;
    renderRoute(`/admin/turmas/${fundamentos.id}`, {
      session: makeMeResponse({ memberships: [admin()] }),
    });

    expect(await screen.findByRole('heading', { name: 'Fundamentos' })).toBeInTheDocument();
    expect(screen.getByText('Prof. Rafael Nunes')).toBeInTheDocument();
    expect(screen.getByText('19:00 – 20:00')).toBeInTheDocument();
    expect(screen.getByText('toda semana')).toBeInTheDocument();
    // Selected weekday chips (Seg/Qua/Sex) vs idle (Ter) — read-only display.
    expect(screen.getByText('Seg')).toHaveClass('Chip-selected');
    expect(screen.getByText('Ter')).not.toHaveClass('Chip-selected');
    // Server-derived occupancy; no sessions ⇒ frequência stays honest ("—").
    expect(screen.getByText('3 de 24')).toBeInTheDocument();
    expect(screen.getByText('frequência média')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Sem chamadas registradas')).toBeInTheDocument();
    // Session list empty state (ATT.14).
    expect(screen.getByText('Chamadas')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma chamada registrada ainda')).toBeInTheDocument();
    // Roster rows.
    expect(screen.getByText('Alunos da turma')).toBeInTheDocument();
    expect(screen.getByText('Lucas Almeida')).toBeInTheDocument();
    expect(screen.getByText('João Ferraz')).toBeInTheDocument();
  });

  it('lists sessions with per-session counts and the derived frequência média (ATT.14)', async () => {
    const registry = makeEnrollmentRegistry();
    const fundamentos = registry.classes[0]!;
    registry.sessions[fundamentos.id] = [
      makeAdminSession({
        sessionDate: '2026-08-03',
        startsAt: '2026-08-03T19:00:00',
        presentCount: 12,
      }),
      makeAdminSession({
        sessionDate: '2026-08-01',
        startsAt: '2026-08-01T19:00:00',
        presentCount: 1,
      }),
    ];
    server.use(...enrollmentHandlers(registry));
    renderRoute(`/admin/turmas/${fundamentos.id}`, {
      session: makeMeResponse({ memberships: [admin()] }),
    });

    // Session rows: weekday-dated, timed, with active attendance counts.
    expect(await screen.findByText('Seg · 03/08/2026')).toBeInTheDocument();
    expect(screen.getByText('12 presenças')).toBeInTheDocument();
    expect(screen.getByText('Sáb · 01/08/2026')).toBeInTheDocument();
    expect(screen.getByText('1 presença')).toBeInTheDocument();
    // Frequência média = mean of listed session counts ((12 + 1) / 2 = 6,5).
    expect(screen.getByText('6,5')).toBeInTheDocument();
    expect(screen.getByText('presenças por aula')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma chamada registrada ainda')).not.toBeInTheDocument();
  });

  it('removes a student from the roster with a single tap', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const fundamentos = registry.classes[0]!;
    const lucasId = registry.students[0]!.id;
    let removedPath: { id: string; studentId: string } | null = null;
    server.use(
      http.delete('/v1/admin/classes/{id}/students/{studentId}', ({ params, response }) => {
        removedPath = { id: params.id, studentId: params.studentId };
        return response(200).json({
          enrollment: { classId: params.id, studentId: params.studentId, status: 'removed' },
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/admin/turmas/${fundamentos.id}`, {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Remover Lucas Almeida' }));
    expect(await screen.findByText('Aluno removido da turma.')).toBeInTheDocument();
    expect(removedPath).toEqual({ id: fundamentos.id, studentId: lucasId });
  });

  it('adds a student from the picker and surfaces class.full as PT-BR error', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const fundamentos = registry.classes[0]!;
    server.use(
      http.post('/v1/admin/classes/{id}/students', ({ response }) =>
        response.untyped(problemResponse(409, 'class.full', 'Class is at capacity')),
      ),
    );
    const user = userEvent.setup();
    renderRoute(`/admin/turmas/${fundamentos.id}`, {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: 'Adicionar aluno' }));
    const sheet = await screen.findByRole('dialog', { name: 'Adicionar aluno' });
    // Roster members are excluded from the picker.
    expect(within(sheet).queryByText('Lucas Almeida')).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /Marina Costa/ }));

    expect(await screen.findByText('A turma está lotada.')).toBeInTheDocument();
  });

  it('adds a student successfully and toasts', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const kids = registry.classes[2]!;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/classes/{id}/students', async ({ request, params, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({
          enrollment: {
            classId: params.id,
            studentId: body['studentId'] as string,
            status: 'active',
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/admin/turmas/${kids.id}`, {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByRole('heading', { name: 'Kids' });

    await user.click(screen.getByRole('button', { name: 'Adicionar aluno' }));
    const sheet = await screen.findByRole('dialog', { name: 'Adicionar aluno' });
    await user.click(within(sheet).getByRole('button', { name: /Pedro Silveira/ }));

    expect(await screen.findByText('Aluno adicionado à turma.')).toBeInTheDocument();
    expect(body).toMatchObject({ studentId: registry.students[2]!.id });
  });
});
