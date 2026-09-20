/**
 * GRD.13 — Regras de graduação (admin-16): merged régua render, ±5 stepper
 * with the 10-lesson floor, kids-only toggles (Laranja seeded off), Salvar
 * bulk PUT and the PT-BR problem mapping. Real routes + real client against
 * MSW (web-07).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BELT_CATALOG,
  catalogBelt,
  graduationHandlers,
  http,
  makeGraduationRules,
  makeMeResponse,
  makeMembership,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

function renderRules() {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute('/admin/graduacao', {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

describe('Regras de graduação (GRD.13)', () => {
  it('renders the merged ladder in régua order with notes and kids-only toggles', async () => {
    server.use(...graduationHandlers());
    renderRules();

    expect(
      await screen.findByRole('heading', { name: 'Regras de graduação' }),
    ).toBeInTheDocument();
    await screen.findByText('Branca');
    // All 10 catalog belts render, drawn via BeltBar (never hex).
    for (const belt of BELT_CATALOG) {
      expect(screen.getByText(belt.name)).toBeInTheDocument();
    }
    // Ladder-specific notes: adult default, black-belt dans, red-belt no degrees.
    expect(
      screen.getAllByText('máx. 4 graus · 40 aulas por grau').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('máx. 6 graus · 40 aulas por grau'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('sem graus · 40 aulas por grau'),
    ).toBeInTheDocument();
    // Toggles exist on the 4 kids belts only — the core ladder is untouchable.
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(
      screen.getByRole('switch', { name: 'Habilitar faixa Cinza' }),
    ).toBeChecked();
    // Laranja arrives seeded off: dimmed note, no stepper.
    expect(
      screen.getByRole('switch', { name: 'Habilitar faixa Laranja' }),
    ).not.toBeChecked();
    expect(screen.getByText('Desativada nesta academia')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Aumentar aulas por grau da faixa Laranja',
      }),
    ).not.toBeInTheDocument();
  });

  it('steps by 5 and refuses values below the 10-lesson floor', async () => {
    server.use(
      ...graduationHandlers({
        rules: makeGraduationRules({ Cinza: { lessonsPerDegree: 15 } }),
      }),
    );
    const user = userEvent.setup();
    renderRules();
    await screen.findByText('Branca');

    // ±5 around the 40 default.
    await user.click(
      screen.getByRole('button', {
        name: 'Aumentar aulas por grau da faixa Branca',
      }),
    );
    expect(
      screen.getByLabelText('Aulas por grau da faixa Branca'),
    ).toHaveTextContent('45');
    await user.click(
      screen.getByRole('button', {
        name: 'Diminuir aulas por grau da faixa Branca',
      }),
    );
    expect(
      screen.getByLabelText('Aulas por grau da faixa Branca'),
    ).toHaveTextContent('40');
    // Floor: 15 → 10, then the decrement refuses to go lower.
    const decrement = screen.getByRole('button', {
      name: 'Diminuir aulas por grau da faixa Cinza',
    });
    await user.click(decrement);
    expect(
      screen.getByLabelText('Aulas por grau da faixa Cinza'),
    ).toHaveTextContent('10');
    expect(decrement).toBeDisabled();
  });

  it('Salvar sends every row in one bulk PUT and toasts success', async () => {
    server.use(...graduationHandlers());
    let body: { rules: Array<Record<string, unknown>> } | null = null;
    server.use(
      http.put('/v1/admin/graduation-rules', async ({ request, response }) => {
        body = (await request.json()) as {
          rules: Array<Record<string, unknown>>;
        };
        return response(200).json({ rules: makeGraduationRules() });
      }),
    );
    const user = userEvent.setup();
    renderRules();
    await screen.findByText('Branca');

    await user.click(
      screen.getByRole('button', {
        name: 'Aumentar aulas por grau da faixa Branca',
      }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Habilitar faixa Cinza' }),
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Regras de graduação salvas.'),
    ).toBeInTheDocument();
    expect(body!.rules).toHaveLength(BELT_CATALOG.length);
    expect(body!.rules).toContainEqual({
      beltId: catalogBelt('Branca').beltId,
      lessonsPerDegree: 45,
      enabled: true,
    });
    expect(body!.rules).toContainEqual({
      beltId: catalogBelt('Cinza').beltId,
      lessonsPerDegree: 40,
      enabled: false,
    });
    // Laranja stays off unless the admin re-enables it.
    expect(body!.rules).toContainEqual({
      beltId: catalogBelt('Laranja').beltId,
      lessonsPerDegree: 40,
      enabled: false,
    });
  });

  it('maps the graduation problem codes to PT-BR on a rejected save', async () => {
    server.use(...graduationHandlers());
    server.use(
      http.put('/v1/admin/graduation-rules', ({ response }) =>
        response.untyped(
          problemResponse(
            422,
            'graduation.lessons_below_minimum',
            'below minimum',
          ),
        ),
      ),
    );
    const user = userEvent.setup();
    renderRules();
    await screen.findByText('Branca');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Aulas por grau deve ser de no mínimo 10.'),
    ).toBeTruthy();
  });
});
