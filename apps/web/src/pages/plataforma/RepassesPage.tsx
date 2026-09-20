/**
 * Faturamento e repasses (BIL.15, plataforma-09) — the platform console's
 * first real screen. SaaS totals tiles ("assinaturas · mês", "taxa de
 * pagamento") and the per-academy repasse list from the read model: net
 * amount (gross − fee_bps) with the Repassado / Em trânsito / Retido status
 * — delinquent academies always Retido ("assinatura vencida"), the
 * charter's retention rule as visible truth. Platform owner/finance only;
 * support gets the API's 403.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, Chip, ListRow, ScreenHeader } from '@tatame/design-system';
import { ApiErrorCodes, isProblemCode, type RepasseRow } from '@tatame/shared';
import { $api } from '../../api/api';
import { InitialsAvatar } from '../admin/common';
import { formatBRLWhole, monthName } from '../billing-format';

const STATUS_CHIPS: Record<
  RepasseRow['status'],
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  repassado: { label: 'Repassado', tone: 'success' },
  em_transito: { label: 'Em trânsito', tone: 'warning' },
  retido: { label: 'Retido', tone: 'danger' },
};

function TotalTile({ value, caption }: { value: string; caption: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Card padding={14}>
        <Typography
          sx={{ fontSize: 19, fontWeight: 800, color: 'var(--fg-1)' }}
        >
          {value}
        </Typography>
        <Typography
          sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-3)' }}
        >
          {caption}
        </Typography>
      </Card>
    </Box>
  );
}

function repasseSubtitle(row: RepasseRow): string {
  if (row.withheld) return 'Retido — assinatura vencida';
  return `Mensalidades de ${monthName(row.period)} · ${row.studentCount} alunos`;
}

export function RepassesPage() {
  const query = $api.useQuery('get', '/v1/platform/billing/repasses');
  const data = query.data;
  const forbidden = isProblemCode(
    query.error,
    ApiErrorCodes.AUTHZ_FORBIDDEN_ROLE,
  );

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Faturamento e repasses"
          subtitle="Assinaturas SaaS + taxa sobre pagamentos processados."
        />

        {query.isLoading ? (
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Carregando faturamento…
          </Typography>
        ) : null}
        {query.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            {forbidden
              ? 'Seu perfil não tem acesso ao faturamento da plataforma.'
              : 'Não foi possível carregar o faturamento. Tente novamente.'}
          </Typography>
        ) : null}

        {data ? (
          <>
            <Stack direction="row" spacing="12px">
              <TotalTile
                value={formatBRLWhole(data.totals.subscriptionsMonthCents)}
                caption="assinaturas · mês"
              />
              <TotalTile
                value={formatBRLWhole(data.totals.paymentFeesMonthCents)}
                caption="taxa de pagamento"
              />
            </Stack>

            <Typography
              sx={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}
            >
              Repasses às academias
            </Typography>
            <Card padding={4}>
              {data.repasses.length === 0 ? (
                <Typography
                  sx={{
                    fontSize: 12.5,
                    color: 'var(--fg-3)',
                    padding: '12px 14px',
                  }}
                >
                  Nenhum repasse no período.
                </Typography>
              ) : null}
              {data.repasses.map((row) => {
                const status = STATUS_CHIPS[row.status];
                return (
                  <ListRow
                    key={row.academyId}
                    title={row.academyName}
                    subtitle={repasseSubtitle(row)}
                    leading={<InitialsAvatar name={row.academyName} />}
                    trailing={
                      <Stack sx={{ alignItems: 'flex-end' }} spacing="4px">
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--fg-1)',
                          }}
                        >
                          {formatBRLWhole(row.netCents)}
                        </Typography>
                        <Chip label={status.label} tone={status.tone} />
                      </Stack>
                    }
                  />
                );
              })}
            </Card>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

export default RepassesPage;
