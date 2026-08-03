/**
 * ENR.16 — name-only edit + excluir (soft archive) with confirmation.
 * Contract-fixed capabilities: students rename+archive, guardians rename
 * only (BOSS ruling — no guardian archive), turmas rename+archive with the
 * ended-enrollments warning; professors expose no edit endpoints.
 */
import { screen, waitFor, within } from '@testing-library/react';
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

const session = () => makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

describe('edit + excluir (ENR.16)', () => {
  it('renames a student from the row sheet', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const lucas = registry.students[0]!;
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch('/v1/admin/students/{id}', async ({ params, request, response }) => {
        patched = { id: params.id, body: (await request.json()) as Record<string, unknown> };
        return response(200).json({ student: { ...lucas, fullName: 'Lucas A. Silva' } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: /Lucas Almeida/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar aluno' });
    const field = within(sheet).getByLabelText(/Nome/);
    await user.clear(field);
    await user.type(field, 'Lucas A. Silva');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Nome atualizado.')).toBeInTheDocument();
    expect(patched).toMatchObject({ id: lucas.id, body: { fullName: 'Lucas A. Silva' } });
  });

  it('archives a student only after the confirmation dialog', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const lucas = registry.students[0]!;
    let archivedId: string | null = null;
    server.use(
      http.post('/v1/admin/students/{id}/archive', ({ params, response }) => {
        archivedId = params.id;
        return response(204).empty();
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: /Lucas Almeida/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar aluno' });
    await user.click(within(sheet).getByRole('button', { name: 'Excluir' }));

    const confirm = await screen.findByRole('dialog', { name: 'Excluir aluno' });
    expect(
      within(confirm).getByText(/matrículas ativas serão encerradas/),
    ).toBeInTheDocument();
    expect(archivedId).toBeNull();

    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Aluno excluído.')).toBeInTheDocument();
    expect(archivedId).toBe(lucas.id);
  });

  it('cancelling the confirmation never archives', async () => {
    server.use(...enrollmentHandlers());
    let archived = false;
    server.use(
      http.post('/v1/admin/students/{id}/archive', ({ response }) => {
        archived = true;
        return response(204).empty();
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');

    await user.click(screen.getByRole('button', { name: /Lucas Almeida/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar aluno' });
    await user.click(within(sheet).getByRole('button', { name: 'Excluir' }));
    const confirm = await screen.findByRole('dialog', { name: 'Excluir aluno' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Excluir aluno' })).not.toBeInTheDocument(),
    );
    expect(archived).toBe(false);
  });

  it('renames a guardian and offers no excluir (no archive endpoint this slice)', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const fernanda = registry.guardians[0]!;
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch('/v1/admin/guardians/{id}', async ({ request, response }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return response(200).json({ guardian: { ...fernanda, fullName: 'Fernanda S. Lima' } });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('tab', { name: 'Responsáveis' }));
    await screen.findByText('Fernanda Silveira');

    await user.click(screen.getByRole('button', { name: /Fernanda Silveira/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar responsável' });
    expect(within(sheet).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const field = within(sheet).getByLabelText(/Nome/);
    await user.clear(field);
    await user.type(field, 'Fernanda S. Lima');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Nome atualizado.')).toBeInTheDocument();
    expect(patched).toMatchObject({ fullName: 'Fernanda S. Lima' });
  });

  it('professor rows expose no edit action (no rename/archive endpoints)', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', { session: session() });
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('tab', { name: 'Professores' }));
    await screen.findByText('Rafael Nunes');

    expect(screen.queryByRole('button', { name: /Rafael Nunes/ })).not.toBeInTheDocument();
  });

  it('archives a turma from the detail with the ended-enrollments warning', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const fundamentos = registry.classes[0]!;
    let archivedId: string | null = null;
    server.use(
      http.post('/v1/admin/classes/{id}/archive', ({ params, response }) => {
        archivedId = params.id;
        return response(204).empty();
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute(`/admin/turmas/${fundamentos.id}`, { session: session() });
    await screen.findByRole('heading', { name: 'Fundamentos' });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar turma' });
    await user.click(within(sheet).getByRole('button', { name: 'Excluir' }));

    const confirm = await screen.findByRole('dialog', { name: 'Excluir turma' });
    expect(
      within(confirm).getByText(/matrículas ativas desta turma serão encerradas/),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(archivedId).toBe(fundamentos.id));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/cadastros'),
    );
  });

  it('renames a turma from the detail', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const kids = registry.classes[2]!;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch('/v1/admin/classes/{id}', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(200).json({
          class: { ...registry.classDetails[kids.id]!, name: 'Kids I' },
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/admin/turmas/${kids.id}`, { session: session() });
    await screen.findByRole('heading', { name: 'Kids' });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar turma' });
    const field = within(sheet).getByLabelText(/Nome/);
    await user.clear(field);
    await user.type(field, 'Kids I');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Nome atualizado.')).toBeInTheDocument();
    expect(body).toMatchObject({ name: 'Kids I' });
  });
});
