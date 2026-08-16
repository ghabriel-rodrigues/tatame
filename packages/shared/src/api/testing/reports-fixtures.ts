/**
 * Admin reports fixtures (REP.9 web slice, spec 013). Contract-typed
 * factories for the five admin-18 read models — screenshot-plausible July
 * data aligned with the billing fixtures (Alpha Jiu-Jitsu personas, integer
 * cents, ISO dates). CSV bodies mirror the backend shape: UTF-8 BOM +
 * semicolon delimiter (REP.4), one header row, pt-BR decimal-comma money.
 */
import type {
  AdminReport,
  AdminReportSlug,
  FinanceiroReport,
  FrequenciaReport,
  GraduacoesReport,
  InadimplenciaReport,
  LojaReport,
  ReportWindow,
} from '../types.js';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

/** Calendar-half window (Jan–Jun / Jul–Dec) for the given "YYYY-MM" month. */
export function makeSemesterWindow(month: string): ReportWindow {
  const year = Number(month.slice(0, 4));
  const first = Number(month.slice(5, 7)) <= 6;
  return first
    ? { label: `${year}-S1`, start: `${year}-01-01`, endExclusive: `${year}-07-01` }
    : { label: `${year}-S2`, start: `${year}-07-01`, endExclusive: `${year + 1}-01-01` };
}

export function makeFinanceiroReport(
  overrides: Partial<FinanceiroReport> = {},
): FinanceiroReport {
  return {
    report: 'financeiro',
    month: '2026-07',
    summary: { receitaCents: 2_436_000, previstoCents: 2_590_000, inadimplenciaPct: 6.4 },
    rows: [
      {
        chargeId: uuid('8020', 1),
        studentName: 'Lucas Almeida',
        origin: 'plan',
        periodStart: '2026-07-01',
        dueDate: '2026-07-05',
        status: 'paid',
        amountCents: 18_000,
        paidAt: '2026-07-05T14:00:00.000Z',
      },
      {
        chargeId: uuid('8020', 2),
        studentName: 'Flavia Fila',
        origin: 'plan',
        periodStart: '2026-07-01',
        dueDate: '2026-07-05',
        status: 'overdue',
        amountCents: 18_000,
        paidAt: null,
      },
      {
        chargeId: uuid('8020', 3),
        studentName: 'Pedro Silveira',
        origin: 'order',
        periodStart: null,
        dueDate: '2026-07-14',
        status: 'paid',
        amountCents: 8_900,
        paidAt: '2026-07-14T18:30:00.000Z',
      },
    ],
    materialization: { created: 0, flippedOverdue: 0, autoSettled: 0 },
    ...overrides,
  };
}

export function makeFrequenciaReport(
  overrides: Partial<FrequenciaReport> = {},
): FrequenciaReport {
  return {
    report: 'frequencia',
    month: '2026-07',
    classes: [
      {
        classId: uuid('8021', 1),
        className: 'Fundamentos',
        sessionsCount: 12,
        students: [
          {
            studentId: uuid('8022', 1),
            studentName: 'Lucas Almeida',
            presencas: 11,
            faltas: 1,
            presencePct: 92,
          },
          {
            studentId: uuid('8022', 2),
            studentName: 'Marina Costa',
            presencas: 9,
            faltas: 3,
            presencePct: 75,
          },
        ],
      },
      {
        classId: uuid('8021', 2),
        className: 'Kids',
        sessionsCount: 8,
        students: [
          {
            studentId: uuid('8022', 3),
            studentName: 'Pedro Silveira',
            presencas: 7,
            faltas: 1,
            presencePct: 88,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function makeInadimplenciaReport(
  overrides: Partial<InadimplenciaReport> = {},
): InadimplenciaReport {
  return {
    report: 'inadimplencia',
    asOf: '2026-08-16',
    totals: { count: 2, totalCents: 36_000 },
    rows: [
      {
        chargeId: uuid('8023', 1),
        studentName: 'Flavia Fila',
        guardianName: null,
        amountCents: 18_000,
        dueDate: '2026-07-05',
        daysOverdue: 42,
        notificationsSent: 3,
      },
      {
        chargeId: uuid('8023', 2),
        studentName: 'Pedro Silveira',
        guardianName: 'Paula Silveira',
        amountCents: 18_000,
        dueDate: '2026-08-10',
        daysOverdue: 6,
        notificationsSent: 1,
      },
    ],
    ...overrides,
  };
}

export function makeGraduacoesReport(
  overrides: Partial<GraduacoesReport> = {},
): GraduacoesReport {
  return {
    report: 'graduacoes',
    month: '2026-07',
    semester: makeSemesterWindow('2026-07'),
    rows: [
      {
        graduationId: uuid('8024', 1),
        studentName: 'Lucas Almeida',
        kind: 'belt',
        beltName: 'Azul',
        degree: 0,
        awardedByName: 'Rafael Nunes',
        awardedAt: '2026-07-20T20:00:00.000Z',
      },
      {
        graduationId: uuid('8024', 2),
        studentName: 'Marina Costa',
        kind: 'degree',
        beltName: 'Branca',
        degree: 3,
        awardedByName: 'Rafael Nunes',
        awardedAt: '2026-08-03T20:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

export function makeLojaReport(overrides: Partial<LojaReport> = {}): LojaReport {
  return {
    report: 'loja',
    month: '2026-07',
    totals: { pedidos: 2, itens: 3, vendasCents: 32_700 },
    rows: [
      {
        orderId: uuid('8025', 1),
        number: 2431,
        date: '2026-07-14',
        buyerName: 'Pedro Silveira',
        productName: 'Kimono Alpha A2',
        size: 'A2',
        quantity: 1,
        amountCents: 23_800,
        status: 'delivered',
      },
      {
        orderId: uuid('8025', 2),
        number: 2432,
        date: '2026-07-18',
        buyerName: 'Marina Costa',
        productName: 'Rash Guard',
        size: 'M',
        quantity: 2,
        amountCents: 8_900,
        status: 'paid',
      },
    ],
    ...overrides,
  };
}

/**
 * Slug dispatcher used by the handler defaults: the month/semester echo
 * follows the requested month the way the backend does (inadimplência stays
 * an as-of-now snapshot and ignores it).
 */
export function makeAdminReport(slug: AdminReportSlug, month?: string): AdminReport {
  switch (slug) {
    case 'financeiro':
      return makeFinanceiroReport(month ? { month } : {});
    case 'frequencia':
      return makeFrequenciaReport(month ? { month } : {});
    case 'inadimplencia':
      return makeInadimplenciaReport();
    case 'graduacoes':
      return makeGraduacoesReport(
        month ? { month, semester: makeSemesterWindow(month) } : {},
      );
    case 'loja':
      return makeLojaReport(month ? { month } : {});
  }
}

/** The UTF-8 BOM every report CSV starts with (REP.4, pt-BR Excel). */
export const CSV_BOM = '\uFEFF';

/** REP.4-shaped CSV body: UTF-8 BOM + semicolon delimiter + header row. */
export function makeReportCsvBody(slug: AdminReportSlug): string {
  const bodies: Record<AdminReportSlug, string> = {
    financeiro:
      'aluno;origem;competencia;vencimento;status;valor;pago_em\n' +
      'Lucas Almeida;plano;2026-07-01;2026-07-05;paid;180,00;2026-07-05\n',
    frequencia:
      'turma;aluno;presencas;faltas;percentual\n' +
      'Fundamentos;Lucas Almeida;11;1;92\n',
    inadimplencia:
      'aluno;responsavel;valor;vencimento;dias_em_atraso;notificacoes\n' +
      'Flavia Fila;;180,00;2026-07-05;42;3\n',
    graduacoes:
      'aluno;tipo;faixa;grau;professor;data\n' +
      'Lucas Almeida;faixa;Azul;0;Rafael Nunes;2026-07-20\n',
    loja:
      'pedido;data;comprador;produto;tamanho;quantidade;valor;status\n' +
      '2431;2026-07-14;Pedro Silveira;Kimono Alpha A2;A2;1;238,00;delivered\n',
  };
  return CSV_BOM + bodies[slug];
}
