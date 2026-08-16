/**
 * Print-friendly report view (REP.9, spec 013) — the "PDF" delivery: opened
 * in a new tab by the Relatórios page, renders the report JSON read model in
 * a clean printable layout (academy name, title, period, summary block,
 * table) with a window.print affordance hidden from the printed page. A real
 * server-side PDF library is recorded debt. Lives under the admin surface
 * guard but outside the console shell — paper wants no chrome.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams, useSearchParams } from 'react-router';
import type {
  AdminReport,
  FinanceiroReport,
  FrequenciaReport,
  GraduacoesReport,
  InadimplenciaReport,
  LojaReport,
} from '@tatame/shared';
import { TatameButton } from '@tatame/design-system';
import { $api } from '../../api/api';
import { useAuth } from '../../auth/auth-store';
import { formatBRL, formatPct, shortDateLabel } from '../billing-format';
import {
  ORIGIN_LABELS,
  chargeStatusLabel,
  currentPeriod,
  isReportSlug,
  orderStatusLabel,
  periodLabel,
  reportTitle,
  semesterLabel,
} from './reports-format';

const EMPTY_COPY = 'Sem registros no período.';

const tableSx = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12.5,
  color: 'var(--fg-1)',
  '& th': {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--fg-3)',
    padding: '6px 8px',
    borderBottom: '2px solid var(--border-1)',
  },
  '& td': {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-1)',
  },
} as const;

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'var(--fg-1)' }}>
        {value}
      </Typography>
    </Box>
  );
}

function SummaryBlock({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing="28px"
      sx={{
        padding: '12px 16px',
        border: '1px solid var(--border-1)',
        borderRadius: '12px',
      }}
    >
      {children}
    </Stack>
  );
}

function EmptyCopy() {
  return <Typography sx={{ fontSize: 13, color: 'var(--fg-3)' }}>{EMPTY_COPY}</Typography>;
}

function FinanceiroBody({ data }: { data: FinanceiroReport }) {
  return (
    <>
      <SummaryBlock>
        <SummaryStat label="Receita" value={formatBRL(data.summary.receitaCents)} />
        <SummaryStat label="Previsto" value={formatBRL(data.summary.previstoCents)} />
        <SummaryStat label="Inadimplência" value={formatPct(data.summary.inadimplenciaPct)} />
      </SummaryBlock>
      {data.rows.length === 0 ? (
        <EmptyCopy />
      ) : (
        <Box component="table" sx={tableSx}>
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Origem</th>
              <th>Competência</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Pago em</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.chargeId}>
                <td>{row.studentName ?? '—'}</td>
                <td>{ORIGIN_LABELS[row.origin]}</td>
                <td>{row.periodStart ? shortDateLabel(row.periodStart) : '—'}</td>
                <td>{shortDateLabel(row.dueDate)}</td>
                <td>{chargeStatusLabel(row.status)}</td>
                <td>{formatBRL(row.amountCents)}</td>
                <td>{row.paidAt ? shortDateLabel(row.paidAt.slice(0, 10)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </>
  );
}

function FrequenciaBody({ data }: { data: FrequenciaReport }) {
  if (data.classes.length === 0) return <EmptyCopy />;
  return (
    <>
      {data.classes.map((turma) => (
        <Box key={turma.classId}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>
            {turma.className}
            <Box component="span" sx={{ fontWeight: 600, color: 'var(--fg-3)', fontSize: 12 }}>
              {` · ${turma.sessionsCount} ${turma.sessionsCount === 1 ? 'aula' : 'aulas'} no mês`}
            </Box>
          </Typography>
          {turma.students.length === 0 ? (
            <EmptyCopy />
          ) : (
            <Box component="table" sx={tableSx}>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Presenças</th>
                  <th>Faltas</th>
                  <th>Presença</th>
                </tr>
              </thead>
              <tbody>
                {turma.students.map((student) => (
                  <tr key={student.studentId}>
                    <td>{student.studentName}</td>
                    <td>{student.presencas}</td>
                    <td>{student.faltas}</td>
                    <td>{formatPct(student.presencePct)}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          )}
        </Box>
      ))}
    </>
  );
}

function InadimplenciaBody({ data }: { data: InadimplenciaReport }) {
  return (
    <>
      <SummaryBlock>
        <SummaryStat label="Cobranças vencidas" value={String(data.totals.count)} />
        <SummaryStat label="Total em aberto" value={formatBRL(data.totals.totalCents)} />
      </SummaryBlock>
      {data.rows.length === 0 ? (
        <EmptyCopy />
      ) : (
        <Box component="table" sx={tableSx}>
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Responsável</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Dias em atraso</th>
              <th>Notificações</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.chargeId}>
                <td>{row.studentName ?? '—'}</td>
                <td>{row.guardianName ?? '—'}</td>
                <td>{formatBRL(row.amountCents)}</td>
                <td>{shortDateLabel(row.dueDate)}</td>
                <td>{row.daysOverdue}</td>
                <td>{row.notificationsSent}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </>
  );
}

function GraduacoesBody({ data }: { data: GraduacoesReport }) {
  if (data.rows.length === 0) return <EmptyCopy />;
  return (
    <Box component="table" sx={tableSx}>
      <thead>
        <tr>
          <th>Aluno</th>
          <th>Tipo</th>
          <th>Faixa</th>
          <th>Grau</th>
          <th>Professor</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={row.graduationId}>
            <td>{row.studentName}</td>
            <td>{row.kind === 'belt' ? 'Faixa' : 'Grau'}</td>
            <td>{row.beltName}</td>
            <td>{row.kind === 'belt' ? '—' : `${row.degree}º`}</td>
            <td>{row.awardedByName}</td>
            <td>{shortDateLabel(row.awardedAt.slice(0, 10))}</td>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

function LojaBody({ data }: { data: LojaReport }) {
  return (
    <>
      <SummaryBlock>
        <SummaryStat label="Pedidos" value={String(data.totals.pedidos)} />
        <SummaryStat label="Itens" value={String(data.totals.itens)} />
        <SummaryStat label="Vendas" value={formatBRL(data.totals.vendasCents)} />
      </SummaryBlock>
      {data.rows.length === 0 ? (
        <EmptyCopy />
      ) : (
        <Box component="table" sx={tableSx}>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Data</th>
              <th>Comprador</th>
              <th>Produto</th>
              <th>Tam.</th>
              <th>Qtd.</th>
              <th>Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={`${row.orderId}-${row.productName}-${row.size ?? ''}`}>
                <td>#{row.number}</td>
                <td>{shortDateLabel(row.date)}</td>
                <td>{row.buyerName}</td>
                <td>{row.productName}</td>
                <td>{row.size ?? '—'}</td>
                <td>{row.quantity}</td>
                <td>{formatBRL(row.amountCents)}</td>
                <td>{orderStatusLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </>
  );
}

function ReportBody({ data }: { data: AdminReport }) {
  switch (data.report) {
    case 'financeiro':
      return <FinanceiroBody data={data} />;
    case 'frequencia':
      return <FrequenciaBody data={data} />;
    case 'inadimplencia':
      return <InadimplenciaBody data={data} />;
    case 'graduacoes':
      return <GraduacoesBody data={data} />;
    case 'loja':
      return <LojaBody data={data} />;
  }
}

/** Human period line per window kind (month / semester / as-of snapshot). */
function periodLine(data: AdminReport): string {
  switch (data.report) {
    case 'graduacoes':
      return semesterLabel(data.semester.label);
    case 'inadimplencia':
      return `Situação em ${shortDateLabel(data.asOf)}`;
    default:
      return periodLabel(data.month);
  }
}

export function ReportPrintPage() {
  const { report } = useParams();
  const [searchParams] = useSearchParams();
  const month = searchParams.get('month') ?? currentPeriod();
  const slug = isReportSlug(report) ? report : null;
  const { session } = useAuth();

  const query = $api.useQuery(
    'get',
    '/v1/admin/reports/{report}',
    { params: { path: { report: slug ?? 'financeiro' }, query: { month } } },
    { enabled: slug !== null },
  );

  if (!slug) {
    return (
      <Typography role="alert" sx={{ padding: '32px', color: 'var(--danger-500)' }}>
        Relatório desconhecido.
      </Typography>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', background: 'var(--bg-surface)' }}>
      <Box sx={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
        <Stack spacing="18px">
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-3)' }}>
                {session?.academy?.name ?? ''}
              </Typography>
              <Typography
                component="h1"
                sx={{ fontSize: 24, fontWeight: 800, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}
              >
                {reportTitle(slug)}
              </Typography>
              {query.data ? (
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)' }}>
                  {periodLine(query.data)}
                </Typography>
              ) : null}
            </Box>
            <Box sx={{ '@media print': { display: 'none' } }}>
              <TatameButton
                variant="primary"
                size="sm"
                label="Imprimir"
                onPress={() => window.print()}
              />
            </Box>
          </Stack>

          {query.isLoading ? (
            <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)' }}>
              Carregando relatório…
            </Typography>
          ) : null}
          {query.isError ? (
            <Typography
              role="alert"
              sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
            >
              Não foi possível carregar o relatório. Tente novamente.
            </Typography>
          ) : null}

          {query.data ? <ReportBody data={query.data} /> : null}
        </Stack>
      </Box>
    </Box>
  );
}

export default ReportPrintPage;
