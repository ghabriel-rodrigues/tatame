/**
 * Visão geral (PLT.10, plataforma-02) — the platform console home. MRR hero
 * with the month-over-month pill, the three stat tiles (academias, alunos na
 * base, inadimplência), the 6-month MRR chart and "Precisam de atenção".
 * Every number is server-derived; this screen only renders the read model.
 *
 * Owner/finance only — the API refuses support, and the console's index
 * redirect sends that role to Academias instead of a 403.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link, useNavigate } from 'react-router';
import {
  Card,
  Chip,
  ListRow,
  MiniBarChart,
  ScreenHeader,
} from '@tatame/design-system';
import {
  ApiErrorCodes,
  isProblemCode,
  type AttentionRow,
} from '@tatame/shared';
import { $api } from '../../api/api';
import { InitialsAvatar } from '../admin/common';
import { formatBRLCompact, formatBRLWhole, formatPct } from '../billing-format';
import { deltaLabel, formatCount, monthShortKey } from './platform-format';

function StatTile({
  value,
  caption,
  tone,
}: {
  value: string;
  caption: string;
  tone?: 'danger';
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Card padding={14}>
        <Typography
          sx={{
            fontSize: 19,
            fontWeight: 800,
            color: tone === 'danger' ? 'var(--danger-500)' : 'var(--fg-1)',
          }}
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

function AttentionListRow({ row }: { row: AttentionRow }) {
  const navigate = useNavigate();
  return (
    <ListRow
      title={row.academyName}
      subtitle={row.reason}
      leading={<InitialsAvatar name={row.academyName} />}
      trailing={
        <Chip
          label={row.kind === 'trial_ending' ? 'Trial' : 'Inadimplente'}
          tone={row.kind === 'trial_ending' ? 'brand' : 'danger'}
        />
      }
      chevron
      onPress={() => navigate(`/plataforma/academias/${row.academyId}`)}
    />
  );
}

export function VisaoGeralPage() {
  const query = $api.useQuery('get', '/v1/platform/overview');
  const data = query.data;
  const forbidden = isProblemCode(
    query.error,
    ApiErrorCodes.AUTHZ_FORBIDDEN_ROLE,
  );
  const previousMonth = data?.series[data.series.length - 2]?.month;
  const delta = data ? deltaLabel(data.mrrDeltaPct, previousMonth) : null;

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Visão geral"
          subtitle="Receita, base de academias e quem precisa de atenção."
        />

        {query.isLoading ? (
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Carregando visão geral…
          </Typography>
        ) : null}
        {query.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            {forbidden
              ? 'Seu perfil não tem acesso à visão geral da plataforma.'
              : 'Não foi possível carregar a visão geral. Tente novamente.'}
          </Typography>
        ) : null}

        {data ? (
          <>
            <Card variant="hero">
              <Typography
                variant="overline"
                sx={{ color: 'inherit', opacity: 0.8 }}
              >
                Receita recorrente mensal
              </Typography>
              <Typography
                sx={{
                  fontSize: 32,
                  fontWeight: 800,
                  marginTop: '2px',
                  color: 'inherit',
                }}
              >
                {formatBRLWhole(data.mrrCents)}
              </Typography>
              {delta ? (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    marginTop: '12px',
                    padding: '5px 11px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.18)',
                    color: 'inherit',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {delta}
                </Box>
              ) : null}
            </Card>

            <Stack direction="row" spacing="12px">
              <StatTile
                value={formatCount(data.academyCount)}
                caption="academias"
              />
              <StatTile
                value={formatCount(data.studentCount)}
                caption="alunos na base"
              />
              <StatTile
                value={formatPct(data.delinquencyPct)}
                caption="inadimplência"
                tone="danger"
              />
            </Stack>

            <Card padding={16}>
              <Typography
                sx={{
                  fontSize: 14.5,
                  fontWeight: 700,
                  color: 'var(--fg-1)',
                  marginBottom: '10px',
                }}
              >
                MRR · últimos 6 meses
              </Typography>
              <MiniBarChart
                data={data.series.map((point) => ({
                  label: monthShortKey(point.month),
                  value: point.cents,
                }))}
                formatValue={formatBRLCompact}
                ariaLabel="MRR dos últimos 6 meses"
              />
            </Card>

            <Stack
              direction="row"
              sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
            >
              <Typography
                sx={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}
              >
                Precisam de atenção
              </Typography>
              <Typography
                component={Link}
                to="/plataforma/academias"
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--brand-1)',
                  textDecoration: 'none',
                }}
              >
                Todas as academias
              </Typography>
            </Stack>
            <Card padding={4}>
              {data.attention.length === 0 ? (
                <Typography
                  sx={{
                    fontSize: 12.5,
                    color: 'var(--fg-3)',
                    padding: '12px 14px',
                  }}
                >
                  Nenhuma academia precisa de atenção agora.
                </Typography>
              ) : (
                data.attention.map((row) => (
                  <AttentionListRow
                    key={`${row.academyId}-${row.kind}`}
                    row={row}
                  />
                ))
              )}
            </Card>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

export default VisaoGeralPage;
