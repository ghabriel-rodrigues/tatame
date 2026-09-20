/**
 * BIL.13 — Visão financeira (admin-02) as the /admin index: hero receita
 * card (mês, no ano, previsão, inadimplência %), 6-month MiniBarChart,
 * próximos vencimentos grouped by due day and the inadimplentes list.
 * Materialization is server-side on the overview call — the page only
 * renders. Real routes + real client against MSW (web-07).
 */
import { screen } from '@testing-library/react';
import {
  billingHandlers,
  makeAdminOverview,
  makeMeResponse,
  makeMembership,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';
import {
  daysOverdue,
  formatBRL,
  formatBRLCompact,
  formatBRLWhole,
} from '../billing-format';

function renderOverview() {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute('/admin', {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

describe('Visão financeira (BIL.13)', () => {
  it('renders the hero receita card with mês, no ano, previsão and inadimplência %', async () => {
    server.use(...billingHandlers());
    renderOverview();

    expect(
      await screen.findByRole('heading', { name: 'Visão financeira' }),
    ).toBeInTheDocument();
    // Hero: "RECEITA DE JULHO" + R$ 24.360 (admin-02 numbers).
    expect(await screen.findByText('Receita de julho')).toBeInTheDocument();
    expect(screen.getByText(formatBRLWhole(2_436_000))).toBeInTheDocument();
    // Sub-stats: no ano R$ 163,4 mil · previsão agosto R$ 25.900 · 6,4%.
    expect(screen.getByText('no ano')).toBeInTheDocument();
    expect(screen.getByText(formatBRLCompact(16_340_000))).toBeInTheDocument();
    expect(screen.getByText('previsão agosto')).toBeInTheDocument();
    expect(screen.getByText(formatBRLWhole(2_590_000))).toBeInTheDocument();
    expect(screen.getByText('inadimplência')).toBeInTheDocument();
    expect(screen.getByText('6,4%')).toBeInTheDocument();
  });

  it('draws the 6-month bar series with the current month highlighted', async () => {
    server.use(...billingHandlers());
    renderOverview();
    await screen.findByText('Receita mensal');

    expect(screen.getByText('Últimos 6 meses')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Receita mensal dos últimos 6 meses' }),
    ).toBeInTheDocument();
    // One labeled bar per month (aria-label "JUL: R$ 24,4 mil").
    const bars = screen.getAllByLabelText(/^(FEV|MAR|ABR|MAI|JUN|JUL): /);
    expect(bars).toHaveLength(6);
    // FEV…JUL axis labels; JUL (the current month) is the highlighted bar.
    for (const label of ['FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    const classOf = (element: unknown) =>
      (element as { className: string }).className;
    expect(classOf(screen.getByLabelText(/^JUL: /))).toContain(
      'MiniBarChart-highlight',
    );
    expect(classOf(screen.getByLabelText(/^FEV: /))).not.toContain(
      'MiniBarChart-highlight',
    );
  });

  it('groups próximos vencimentos by due day with count and amount', async () => {
    server.use(...billingHandlers());
    renderOverview();
    await screen.findByText('Próximos vencimentos');

    expect(screen.getByText('Dia 5 de agosto')).toBeInTheDocument();
    expect(
      screen.getByText(`2 cobranças · ${formatBRL(36_000)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Lucas Almeida')).toBeInTheDocument();
    expect(screen.getByText('Marina Costa')).toBeInTheDocument();
    expect(screen.getByText('Dia 10 de agosto')).toBeInTheDocument();
    expect(
      screen.getByText(`1 cobrança · ${formatBRL(15_000)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Pedro Silveira')).toBeInTheDocument();
    expect(screen.getByText('Kids Mensal')).toBeInTheDocument();
  });

  it('lists inadimplentes with amount, since-date and days overdue', async () => {
    server.use(...billingHandlers());
    renderOverview();
    await screen.findByText('Inadimplentes');

    expect(screen.getByText('Flavia Fila')).toBeInTheDocument();
    expect(
      screen.getByText('1 cobrança em aberto · desde 05/07/2026'),
    ).toBeInTheDocument();
    // R$ 180,00 also appears on the vencimento rows — assert presence, not uniqueness.
    expect(screen.getAllByText(formatBRL(18_000)).length).toBeGreaterThan(0);
    const days = daysOverdue('2026-07-05');
    expect(
      screen.getByText(`${days} ${days === 1 ? 'dia' : 'dias'}`),
    ).toBeInTheDocument();
  });

  it('renders the empty-list copy when there is nothing due or overdue', async () => {
    server.use(
      ...billingHandlers({
        overview: makeAdminOverview({
          proximosVencimentos: [],
          inadimplentes: [],
        }),
      }),
    );
    renderOverview();

    expect(
      await screen.findByText('Nenhuma cobrança em aberto no próximo ciclo.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nenhum aluno inadimplente neste ciclo.'),
    ).toBeInTheDocument();
  });
});
