/**
 * BIL.15 — Faturamento e repasses (plataforma-09), reachable from the Conta
 * hub since PLT.14 (the /plataforma index is now the Visão geral):
 * SaaS totals tiles, the per-academy repasse list with Repassado /
 * Em trânsito / Retido status chips — the delinquent academy always Retido
 * ("assinatura vencida") — and the platform-RBAC denial copy. Real routes +
 * real client against MSW (web-07).
 */
import { screen } from '@testing-library/react';
import {
  http,
  makeMeResponse,
  makePlatformMembership,
  makeRepasses,
  problemResponse,
  repassesHandlers,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';
import { formatBRLWhole } from '../billing-format';

function renderRepasses() {
  const platform = makePlatformMembership();
  return renderRoute('/plataforma/repasses', {
    session: makeMeResponse({ memberships: [platform], academy: null }),
  });
}

describe('Faturamento e repasses (BIL.15)', () => {
  it('renders the SaaS totals tiles from the read model', async () => {
    server.use(...repassesHandlers());
    renderRepasses();

    expect(
      await screen.findByRole('heading', { name: 'Faturamento e repasses' }),
    ).toBeInTheDocument();
    // R$ 19.240 assinaturas · R$ 8.410 taxa (plataforma-09).
    expect(await screen.findByText(formatBRLWhole(1_924_000))).toBeInTheDocument();
    expect(screen.getByText('assinaturas · mês')).toBeInTheDocument();
    expect(screen.getByText(formatBRLWhole(841_000))).toBeInTheDocument();
    expect(screen.getByText('taxa de pagamento')).toBeInTheDocument();
  });

  it('lists per-academy repasses with net amount, period, student count and status chips', async () => {
    server.use(...repassesHandlers());
    renderRepasses();
    await screen.findByText('Repasses às academias');

    expect(screen.getByText('Gracie Vale Norte')).toBeInTheDocument();
    expect(screen.getByText('Mensalidades de julho · 386 alunos')).toBeInTheDocument();
    expect(screen.getByText(formatBRLWhole(5_432_000))).toBeInTheDocument();
    expect(screen.getByText('Horizonte BJJ')).toBeInTheDocument();
    expect(screen.getByText('Choque BJJ Kids')).toBeInTheDocument();
    expect(screen.getAllByText('Repassado')).toHaveLength(2);
    expect(screen.getByText('Em trânsito')).toBeInTheDocument();
  });

  it('flags the delinquent academy Retido with the assinatura-vencida subtitle', async () => {
    server.use(...repassesHandlers());
    renderRepasses();
    await screen.findByText('Alliance Litoral');

    // Charter retention rule: withheld ⇒ Retido, never a period subtitle.
    expect(screen.getByText('Retido — assinatura vencida')).toBeInTheDocument();
    // Exactly one Retido chip, danger-toned (the delinquent Alliance row).
    const chip = screen.getByText('Retido') as unknown as { className: string };
    expect(chip.className).toContain('Chip-danger');
  });

  it('renders custom repasse fixtures (delinquent charlie-fc shape stays Retido)', async () => {
    server.use(
      ...repassesHandlers(
        makeRepasses({
          repasses: [
            {
              academyId: '018f0000-0000-7000-8014-00000000cafe',
              academyName: 'Charlie Fight Club',
              period: '2026-08',
              studentCount: 12,
              grossCents: 100_000,
              feeBps: 0,
              feeCents: 0,
              netCents: 100_000,
              withheld: true,
              status: 'retido',
            },
          ],
        }),
      ),
    );
    renderRepasses();

    expect(await screen.findByText('Charlie Fight Club')).toBeInTheDocument();
    expect(screen.getByText('Retido — assinatura vencida')).toBeInTheDocument();
    expect(screen.getByText('Retido')).toBeInTheDocument();
  });

  it('shows the platform-RBAC denial copy when the API returns 403 (support role)', async () => {
    server.use(
      http.get('/v1/platform/billing/repasses', ({ response }) =>
        response.untyped(problemResponse(403, 'authz.forbidden_role', 'finance only')),
      ),
    );
    renderRepasses();

    // retry: 1 delays the error state past the default findBy timeout.
    expect(
      await screen.findByText(
        'Seu perfil não tem acesso ao faturamento da plataforma.',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
  });
});
