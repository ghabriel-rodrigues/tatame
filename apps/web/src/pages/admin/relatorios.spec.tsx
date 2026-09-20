/**
 * REP.9 — Relatórios (admin-18): header entry from the Visão financeira,
 * month picker driving the month-windowed subtitles and the export query,
 * CSV as an authenticated blob download named by Content-Disposition, PDF
 * opening the print-friendly view in a new tab, and the print view rendering
 * the JSON read model. Real routes + real client against MSW (web-07).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HttpResponse,
  adminReportsHandlers,
  billingHandlers,
  makeFinanceiroReport,
  makeMeResponse,
  makeMembership,
  makeReportCsvBody,
  rawHttp,
} from '@tatame/shared/testing';
import type { AdminReportSlug } from '@tatame/shared';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';
import { formatBRL, formatPct, monthName } from '../billing-format';
import { currentPeriod, periodLabel, previousPeriod } from './reports-format';

function renderRelatorios(path = '/admin/relatorios') {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute(path, {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

/** Captures every CSV request URL and answers with the contract shape. */
function captureCsvRequests(): string[] {
  const calls: string[] = [];
  server.use(
    rawHttp.get(
      'http://localhost/v1/admin/reports/:report/csv',
      ({ request, params }) => {
        calls.push(request.url);
        const month = new URL(request.url).searchParams.get('month') ?? '';
        const slug = params.report as AdminReportSlug;
        return new HttpResponse(makeReportCsvBody(slug), {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${slug}-${month}.csv"`,
          },
        });
      },
    ),
  );
  return calls;
}

const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:relatorio');
const revokeObjectURL = vi.fn((_url: string) => undefined);
/** jsdom has no blob URLs — the download seam is stubbed at the URL statics. */
beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe('Relatórios (REP.9)', () => {
  it('renders the five admin-18 rows with the exact subtitles and both actions', async () => {
    renderRelatorios();
    const month = currentPeriod();

    expect(
      await screen.findByRole('heading', { name: 'Relatórios' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Exporte em CSV ou PDF')).toBeInTheDocument();

    expect(screen.getByText('Financeiro mensal')).toBeInTheDocument();
    expect(
      screen.getByText(
        `Receita, inadimplência e previsto · ${monthName(month)}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Frequência por turma')).toBeInTheDocument();
    expect(
      screen.getByText(`Presenças e faltas por aluno · ${monthName(month)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Inadimplência')).toBeInTheDocument();
    expect(
      screen.getByText('Cobranças vencidas e notificações enviadas'),
    ).toBeInTheDocument();
    expect(screen.getByText('Graduações')).toBeInTheDocument();
    expect(
      screen.getByText('Promoções e graus registrados no semestre'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vendas da loja')).toBeInTheDocument();
    expect(
      screen.getByText('Pedidos, itens e vendas do mês'),
    ).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: 'CSV' })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: 'PDF' })).toHaveLength(5);
    // Month picker defaults to the current month.
    expect(screen.getByRole('combobox', { name: 'Mês' })).toHaveTextContent(
      periodLabel(month),
    );
  });

  it('is reached from the Relatórios header entry on the Visão financeira', async () => {
    server.use(...billingHandlers());
    const user = userEvent.setup();
    renderRelatorios('/admin');

    await screen.findByRole('heading', { name: 'Visão financeira' });
    await user.click(screen.getByRole('button', { name: 'Relatórios' }));

    expect(
      await screen.findByRole('heading', { name: 'Relatórios' }),
    ).toBeInTheDocument();
  });

  it('month picker drives the subtitles and the CSV export query', async () => {
    const calls = captureCsvRequests();
    const user = userEvent.setup();
    renderRelatorios();
    const prev = previousPeriod(currentPeriod());

    await user.click(await screen.findByRole('combobox', { name: 'Mês' }));
    await user.click(screen.getByRole('option', { name: periodLabel(prev) }));

    expect(
      screen.getByText(
        `Receita, inadimplência e previsto · ${monthName(prev)}`,
      ),
    ).toBeInTheDocument();

    const row = screen.getByRole('region', { name: 'Financeiro mensal' });
    await user.click(within(row).getByRole('button', { name: 'CSV' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/v1/admin/reports/financeiro/csv');
    expect(url.searchParams.get('month')).toBe(prev);
  });

  it('CSV click downloads the blob under the Content-Disposition filename', async () => {
    captureCsvRequests();
    const downloads: string[] = [];
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    const user = userEvent.setup();
    renderRelatorios();
    const month = currentPeriod();

    const row = await screen.findByRole('region', { name: 'Inadimplência' });
    await user.click(within(row).getByRole('button', { name: 'CSV' }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    // Cross-realm Blob (undici) — assert shape, not class identity.
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toContain('text/csv');
    expect(blob.size).toBeGreaterThan(0);
    expect(downloads).toEqual([`inadimplencia-${month}.csv`]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:relatorio');
    anchorClick.mockRestore();
  });

  it('surfaces a retryable error when the CSV export fails', async () => {
    server.use(
      rawHttp.get('http://localhost/v1/admin/reports/:report/csv', () =>
        HttpResponse.text('error', { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderRelatorios();

    const row = await screen.findByRole('region', { name: 'Vendas da loja' });
    await user.click(within(row).getByRole('button', { name: 'CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível exportar Vendas da loja. Tente novamente.',
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('PDF opens the print-friendly view in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    renderRelatorios();
    const month = currentPeriod();

    const row = await screen.findByRole('region', { name: 'Graduações' });
    await user.click(within(row).getByRole('button', { name: 'PDF' }));

    expect(open).toHaveBeenCalledWith(
      `/admin/relatorios/graduacoes/imprimir?month=${month}`,
      '_blank',
      'noopener',
    );
    open.mockRestore();
  });
});

describe('Report print view (REP.9)', () => {
  it('renders the financeiro read model in the printable layout', async () => {
    server.use(...adminReportsHandlers());
    renderRelatorios('/admin/relatorios/financeiro/imprimir?month=2026-07');

    expect(
      await screen.findByRole('heading', { name: 'Financeiro mensal' }),
    ).toBeInTheDocument();
    // Human period line arrives with the read model — await it first.
    expect(await screen.findByText('Julho 2026')).toBeInTheDocument();
    // Academy letterhead.
    expect(screen.getByText('Alpha Jiu-Jitsu')).toBeInTheDocument();
    // Summary block per the read model.
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText(formatBRL(2_436_000))).toBeInTheDocument();
    expect(screen.getByText('Previsto')).toBeInTheDocument();
    expect(screen.getByText(formatBRL(2_590_000))).toBeInTheDocument();
    expect(screen.getByText('Inadimplência')).toBeInTheDocument();
    expect(screen.getByText(formatPct(6.4))).toBeInTheDocument();
    // Charge rows with the PT-BR vocabulary.
    expect(screen.getByText('Lucas Almeida')).toBeInTheDocument();
    expect(screen.getByText('Flavia Fila')).toBeInTheDocument();
    expect(screen.getByText('Vencida')).toBeInTheDocument();
    // The window.print affordance.
    expect(
      screen.getByRole('button', { name: 'Imprimir' }),
    ).toBeInTheDocument();
  });

  it('renders the empty state when the report window has no rows', async () => {
    server.use(
      ...adminReportsHandlers({
        reports: { financeiro: makeFinanceiroReport({ rows: [] }) },
      }),
    );
    renderRelatorios('/admin/relatorios/financeiro/imprimir?month=2026-07');

    expect(
      await screen.findByText('Sem registros no período.'),
    ).toBeInTheDocument();
  });
});
