/**
 * CFG.11 — Permissões por perfil (admin-17): role groups with member-count
 * headers, registry-driven toggle rows from the matrix response, and the
 * optimistic single-entry PUT with rollback on failure. Real routes + real
 * client against MSW (web-07).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminConfigHandlers,
  http,
  makeMeResponse,
  makeMembership,
  makePermissionMatrix,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const session = () => makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

describe('Permissões por perfil (CFG.11)', () => {
  it('renders the role groups with member counts and registry-driven rows', async () => {
    server.use(...adminConfigHandlers());
    renderRoute('/admin/permissoes', { session: session() });

    expect(
      await screen.findByRole('heading', { name: 'Permissões por perfil' }),
    ).toBeInTheDocument();

    // Group chips + counts (admin-17 headers, from the extended GET).
    expect(await screen.findByText('Professor')).toBeInTheDocument();
    expect(screen.getByText('2 pessoas neste papel')).toBeInTheDocument();
    expect(screen.getByText('Aluno')).toBeInTheDocument();
    expect(screen.getByText('142 pessoas neste papel')).toBeInTheDocument();
    expect(screen.getByText('Responsável')).toBeInTheDocument();
    expect(screen.getByText('38 pessoas neste papel')).toBeInTheDocument();

    // Rows come straight from the matrix (registry as the single source).
    expect(screen.getByLabelText('Registrar presença')).toBeChecked();
    expect(screen.getByLabelText('Atualizar graduações')).toBeChecked();
    expect(screen.getByLabelText('Ver pagamentos das turmas')).not.toBeChecked();
    expect(screen.getByLabelText('Gerar convite')).toBeChecked();
    expect(screen.getByLabelText('Criar eventos')).not.toBeChecked();
    expect(screen.getByLabelText('Comprar na loja')).toBeChecked();
    expect(screen.getByLabelText('Cadastrar dependentes')).toBeChecked();
    expect(screen.getByLabelText('Confirmar eventos')).toBeChecked();
  });

  it('uses the singular count copy for a single member', async () => {
    server.use(
      ...adminConfigHandlers({
        matrix: makePermissionMatrix({ memberCounts: { professor: 1 } }),
      }),
    );
    renderRoute('/admin/permissoes', { session: session() });

    expect(await screen.findByText('1 pessoa neste papel')).toBeInTheDocument();
  });

  it('flips a toggle optimistically and PUTs the single entry', async () => {
    server.use(...adminConfigHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('/v1/admin/permissions', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        const matrix = makePermissionMatrix();
        return response(200).json({
          ...matrix,
          permissions: matrix.permissions.map((row) =>
            row.role === 'professor' && row.key === 'events.create'
              ? { ...row, allowed: true }
              : row,
          ),
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/permissoes', { session: session() });
    await screen.findByRole('heading', { name: 'Permissões por perfil' });

    await user.click(await screen.findByLabelText('Criar eventos'));

    // Optimistic: on before the PUT settles, and it stays on.
    expect(screen.getByLabelText('Criar eventos')).toBeChecked();
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      entries: [{ role: 'professor', key: 'events.create', allowed: true }],
    });
    expect(screen.getByLabelText('Criar eventos')).toBeChecked();
  });

  it('rolls the toggle back and shows the error when the PUT fails', async () => {
    server.use(...adminConfigHandlers());
    server.use(
      http.put('/v1/admin/permissions', ({ response }) =>
        response.untyped(problemResponse(500, 'internal')),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/permissoes', { session: session() });
    await screen.findByRole('heading', { name: 'Permissões por perfil' });

    await user.click(await screen.findByLabelText('Registrar presença'));

    expect(
      await screen.findByText('Não foi possível salvar a permissão. Tente novamente.'),
    ).toBeInTheDocument();
    // Rollback: the switch reverts to the server truth.
    expect(screen.getByLabelText('Registrar presença')).toBeChecked();
  });

  it('back arrow returns to the Configurações hub', async () => {
    server.use(...adminConfigHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/permissoes', { session: session() });
    await screen.findByRole('heading', { name: 'Permissões por perfil' });

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(
      await screen.findByRole('heading', { name: 'Configurações' }),
    ).toBeInTheDocument();
  });
});
