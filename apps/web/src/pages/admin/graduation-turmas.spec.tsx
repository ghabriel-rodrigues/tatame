/**
 * GRD.14 — turma belt range: min/max selects on the nova turma form (enabled
 * belts only, optional), the "Branca a Azul" chip on class rows and the
 * drawn range chips on the turma detail (Phase-3 deferral closed).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  catalogBelt,
  enrollmentHandlers,
  http,
  makeClassDetail,
  makeEnrollmentRegistry,
  makeMeResponse,
  makeMembership,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const admin = () => makeMembership({ role: 'admin' });

describe('turma belt range (GRD.14)', () => {
  it('shows the "Branca a Azul" range chip on class rows', async () => {
    server.use(...enrollmentHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/cadastros', {
      session: makeMeResponse({ memberships: [admin()] }),
    });
    await screen.findByText('Lucas Almeida');
    await user.click(screen.getByRole('tab', { name: 'Turmas' }));

    expect(await screen.findByText('Fundamentos')).toBeInTheDocument();
    // Fundamentos carries the Branca→Azul range; Kids has none.
    expect(screen.getByText('Branca a Azul')).toBeInTheDocument();
  });

  it('renders the drawn belt-range chips on the turma detail', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    const fundamentos = registry.classes[0]!;
    renderRoute(`/admin/turmas/${fundamentos.id}`, {
      session: makeMeResponse({ memberships: [admin()] }),
    });

    expect(await screen.findByRole('heading', { name: 'Fundamentos' })).toBeInTheDocument();
    expect(screen.getByText('Faixas')).toBeInTheDocument();
    // BeltChips drawn from the payload slugs — belt name labels, never hex.
    expect(screen.getByRole('img', { name: 'Faixa branca' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Faixa azul' })).toBeInTheDocument();
  });

  it('posts minBeltId/maxBeltId picked from enabled belts on the nova turma form', async () => {
    const registry = makeEnrollmentRegistry();
    server.use(...enrollmentHandlers(registry));
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/classes', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json({ class: makeClassDetail({ name: 'Competição' }) });
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
    await user.type(within(sheet).getByLabelText(/Nome da turma/), 'Competição');
    await user.click(within(sheet).getByRole('button', { name: 'Seg' }));
    // Comboboxes in order: professor, faixa mínima, faixa máxima.
    await user.click(within(sheet).getAllByRole('combobox')[0]!);
    await user.click(await screen.findByRole('option', { name: 'Rafael Nunes' }));
    await user.click(within(sheet).getAllByRole('combobox')[1]!);
    await user.click(await screen.findByRole('option', { name: 'Faixa azul' }));
    await user.click(within(sheet).getAllByRole('combobox')[2]!);
    await user.click(await screen.findByRole('option', { name: 'Faixa preta' }));
    await user.click(within(sheet).getByRole('button', { name: 'Criar turma' }));

    expect(await screen.findByText('Turma criada.')).toBeInTheDocument();
    expect(body).toMatchObject({
      name: 'Competição',
      minBeltId: catalogBelt('Azul').beltId,
      maxBeltId: catalogBelt('Preta').beltId,
    });
  });
});
