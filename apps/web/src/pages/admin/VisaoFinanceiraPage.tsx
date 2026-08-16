/**
 * Visão financeira (BIL.13, admin-02) — the console home. Hero receita card
 * (mês, "no ano", previsão, inadimplência %), the "Receita mensal" 6-month
 * MiniBarChart, "Próximos vencimentos" grouped by due day and the
 * inadimplentes list. Charge materialization happens server-side on the
 * overview call — this screen only renders the derived aggregates.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import {
  Card,
  Chip,
  ListRow,
  MiniBarChart,
  ScreenHeader,
  TatameButton,
} from '@tatame/design-system';
import type { DelinquentStudent, UpcomingGroup } from '@tatame/shared';
import { $api } from '../../api/api';
import { InitialsAvatar } from './common';
import {
  chargesCountLabel,
  daysOverdue,
  dueDayLabel,
  formatBRL,
  formatBRLCompact,
  formatBRLWhole,
  formatPct,
  monthName,
  monthShort,
  nextPeriod,
  shortDateLabel,
} from '../billing-format';

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'inherit',
          opacity: 0.75,
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'inherit' }}>{value}</Typography>
    </Box>
  );
}

function SectionCard({ title, caption, children }: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <Card padding={16}>
      <Stack
        direction="row"
        sx={{ alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}
      >
        <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}>
          {title}
        </Typography>
        {caption ? (
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-3)' }}>
            {caption}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Card>
  );
}

function VencimentoGroup({ group }: { group: UpcomingGroup }) {
  return (
    <Box>
      <Stack
        direction="row"
        sx={{ alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0 2px' }}
      >
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-2)' }}>
          {dueDayLabel(group.dueDate)}
        </Typography>
        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-3)' }}>
          {chargesCountLabel(group.count)} · {formatBRL(group.totalCents)}
        </Typography>
      </Stack>
      {group.charges.map((charge) => (
        <ListRow
          key={charge.chargeId}
          title={charge.studentName}
          {...(charge.planName ? { subtitle: charge.planName } : {})}
          leading={<InitialsAvatar name={charge.studentName} />}
          trailing={
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>
              {formatBRL(charge.amountCents)}
            </Typography>
          }
        />
      ))}
    </Box>
  );
}

function InadimplenteRow({ entry }: { entry: DelinquentStudent }) {
  const days = daysOverdue(entry.oldestDueDate);
  return (
    <ListRow
      title={entry.fullName}
      subtitle={`${chargesCountLabel(entry.chargeCount)} em aberto · desde ${shortDateLabel(entry.oldestDueDate)}`}
      leading={<InitialsAvatar name={entry.fullName} />}
      trailing={
        <Stack sx={{ alignItems: 'flex-end' }} spacing="4px">
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>
            {formatBRL(entry.totalCents)}
          </Typography>
          <Chip label={`${days} ${days === 1 ? 'dia' : 'dias'}`} tone="danger" />
        </Stack>
      }
    />
  );
}

export function VisaoFinanceiraPage() {
  const navigate = useNavigate();
  const overview = $api.useQuery('get', '/v1/admin/billing/overview');
  const data = overview.data;

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Visão financeira"
          subtitle="Receita, previsão e inadimplência da academia."
          trailing={
            // REP.9: the admin prototype's header action into admin-18.
            <TatameButton
              variant="secondary"
              size="sm"
              label="Relatórios"
              onPress={() => navigate('/admin/relatorios')}
            />
          }
        />

        {overview.isLoading ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
            Carregando visão financeira…
          </Typography>
        ) : null}
        {overview.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            Não foi possível carregar a visão financeira. Tente novamente.
          </Typography>
        ) : null}

        {data ? (
          <>
            <Card variant="hero">
              <Typography variant="overline" sx={{ color: 'inherit', opacity: 0.8 }}>
                Receita de {monthName(data.month)}
              </Typography>
              <Typography
                sx={{ fontSize: 32, fontWeight: 800, marginTop: '2px', color: 'inherit' }}
              >
                {formatBRLWhole(data.receitaMesCents)}
              </Typography>
              <Stack
                direction="row"
                spacing="14px"
                divider={
                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{ borderColor: 'rgba(255, 255, 255, 0.25)' }}
                  />
                }
                sx={{ marginTop: '14px' }}
              >
                <HeroStat label="no ano" value={formatBRLCompact(data.receitaAnoCents)} />
                <HeroStat
                  label={`previsão ${monthName(nextPeriod(data.month))}`}
                  value={formatBRLWhole(data.previsaoProximoMesCents)}
                />
                <HeroStat label="inadimplência" value={formatPct(data.inadimplenciaPct)} />
              </Stack>
            </Card>

            <SectionCard title="Receita mensal" caption="Últimos 6 meses">
              <MiniBarChart
                data={data.series.map((point) => ({
                  label: monthShort(point.month),
                  value: point.totalCents,
                }))}
                formatValue={formatBRLCompact}
                ariaLabel="Receita mensal dos últimos 6 meses"
              />
            </SectionCard>

            <SectionCard title="Próximos vencimentos">
              {data.proximosVencimentos.length === 0 ? (
                <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
                  Nenhuma cobrança em aberto no próximo ciclo.
                </Typography>
              ) : (
                data.proximosVencimentos.map((group) => (
                  <VencimentoGroup key={group.dueDate} group={group} />
                ))
              )}
            </SectionCard>

            <SectionCard title="Inadimplentes">
              {data.inadimplentes.length === 0 ? (
                <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
                  Nenhum aluno inadimplente neste ciclo.
                </Typography>
              ) : (
                data.inadimplentes.map((entry) => (
                  <InadimplenteRow key={entry.studentId} entry={entry} />
                ))
              )}
            </SectionCard>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

export default VisaoFinanceiraPage;
