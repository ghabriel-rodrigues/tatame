/**
 * Billing fixtures (BIL.13-15 web slice). Contract-typed factories mirroring
 * the dev seed catalog (BIL.5: Mensal R$ 180 due 5, Kids Mensal R$ 150 due
 * 10, archived Trimestral) and the handoff screenshots — admin-02 (Visão
 * financeira numbers) and plataforma-09 (Gracie/Horizonte/Alliance/Choque
 * repasse rows, Alliance Retido on the delinquent academy).
 */
import type {
  AcademyPlan,
  AdminBillingOverview,
  DelinquentStudent,
  RepasseRow,
  RepassesResponse,
  UpcomingGroup,
} from '../types.js';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

let planCounter = 0;
export function makePlan(overrides: Partial<AcademyPlan> = {}): AcademyPlan {
  planCounter += 1;
  return {
    id: uuid('8010', planCounter),
    name: `Plano ${planCounter}`,
    amountCents: 18_000,
    currency: 'BRL',
    recurrence: 'monthly',
    dueDay: 5,
    isActive: true,
    ...overrides,
  };
}

/** Seed-faithful plan catalog (BIL.5): two active plans + one archived. */
export function makePlanCatalog(): AcademyPlan[] {
  return [
    makePlan({
      name: 'Mensal',
      amountCents: 18_000,
      recurrence: 'monthly',
      dueDay: 5,
    }),
    makePlan({
      name: 'Kids Mensal',
      amountCents: 15_000,
      recurrence: 'monthly',
      dueDay: 10,
    }),
    makePlan({
      name: 'Trimestral',
      amountCents: 48_000,
      recurrence: 'quarterly',
      dueDay: 15,
      isActive: false,
    }),
  ];
}

let overdueCounter = 0;
export function makeDelinquentStudent(
  overrides: Partial<DelinquentStudent> = {},
): DelinquentStudent {
  overdueCounter += 1;
  return {
    studentId: uuid('8011', overdueCounter),
    fullName: `Inadimplente ${overdueCounter}`,
    totalCents: 18_000,
    oldestDueDate: '2026-07-05',
    chargeCount: 1,
    ...overrides,
  };
}

let upcomingCounter = 0;
/** One "Próximos vencimentos" group with per-charge rows for the given day. */
export function makeUpcomingGroup(
  overrides: Partial<UpcomingGroup> = {},
): UpcomingGroup {
  upcomingCounter += 1;
  const charges = overrides.charges ?? [
    {
      chargeId: uuid('8012', upcomingCounter * 10 + 1),
      studentId: uuid('8013', upcomingCounter * 10 + 1),
      studentName: 'Lucas Almeida',
      amountCents: 18_000,
      planName: 'Mensal',
    },
  ];
  return {
    dueDate: '2026-08-05',
    count: charges.length,
    totalCents: charges.reduce((sum, charge) => sum + charge.amountCents, 0),
    ...overrides,
    charges,
  };
}

/**
 * admin-02-faithful Visão financeira payload: "RECEITA DE JULHO" R$ 24.360,
 * "no ano" R$ 163,4 mil, previsão agosto R$ 25.900, inadimplência 6,4%, the
 * FEV…JUL 6-month series, one vencimento group per due-day chip and the
 * seeded overdue student.
 */
export function makeAdminOverview(
  overrides: Partial<AdminBillingOverview> = {},
): AdminBillingOverview {
  return {
    month: '2026-07',
    receitaMesCents: 2_436_000,
    receitaAnoCents: 16_340_000,
    previsaoProximoMesCents: 2_590_000,
    inadimplenciaPct: 6.4,
    series: [
      { month: '2026-02', totalCents: 1_920_000 },
      { month: '2026-03', totalCents: 2_080_000 },
      { month: '2026-04', totalCents: 2_150_000 },
      { month: '2026-05', totalCents: 2_210_000 },
      { month: '2026-06', totalCents: 2_330_000 },
      { month: '2026-07', totalCents: 2_436_000 },
    ],
    proximosVencimentos: [
      makeUpcomingGroup({
        dueDate: '2026-08-05',
        charges: [
          {
            chargeId: uuid('8012', 101),
            studentId: uuid('8013', 101),
            studentName: 'Lucas Almeida',
            amountCents: 18_000,
            planName: 'Mensal',
          },
          {
            chargeId: uuid('8012', 102),
            studentId: uuid('8013', 102),
            studentName: 'Marina Costa',
            amountCents: 18_000,
            planName: 'Mensal',
          },
        ],
      }),
      makeUpcomingGroup({
        dueDate: '2026-08-10',
        charges: [
          {
            chargeId: uuid('8012', 103),
            studentId: uuid('8013', 103),
            studentName: 'Pedro Silveira',
            amountCents: 15_000,
            planName: 'Kids Mensal',
          },
        ],
      }),
    ],
    inadimplentes: [
      makeDelinquentStudent({
        fullName: 'Flavia Fila',
        totalCents: 18_000,
        oldestDueDate: '2026-07-05',
        chargeCount: 1,
      }),
    ],
    materialization: { created: 0, flippedOverdue: 0, autoSettled: 0 },
    ...overrides,
  };
}

let repasseCounter = 0;
export function makeRepasseRow(
  overrides: Partial<RepasseRow> = {},
): RepasseRow {
  repasseCounter += 1;
  return {
    academyId: uuid('8014', repasseCounter),
    academyName: `Academia ${repasseCounter}`,
    period: '2026-07',
    studentCount: 100,
    grossCents: 1_000_000,
    feeBps: 120,
    feeCents: 12_000,
    netCents: 988_000,
    withheld: false,
    status: 'repassado',
    ...overrides,
  };
}

/**
 * plataforma-09-faithful repasse read model: SaaS totals (R$ 19.240
 * assinaturas · R$ 8.410 taxa) and the four academy rows — Alliance Litoral
 * is the delinquent-academy Retido fixture (charter retention rule, the
 * seed's charlie-fc shape). fee = gross × fee_bps, net = gross − fee.
 */
export function makeRepasses(
  overrides: Partial<RepassesResponse> = {},
): RepassesResponse {
  return {
    totals: {
      subscriptionsMonthCents: 1_924_000,
      paymentFeesMonthCents: 841_000,
    },
    repasses: [
      makeRepasseRow({
        academyName: 'Gracie Vale Norte',
        studentCount: 386,
        grossCents: 5_497_976,
        feeCents: 65_976,
        netCents: 5_432_000,
        status: 'repassado',
      }),
      makeRepasseRow({
        academyName: 'Horizonte BJJ',
        studentCount: 214,
        grossCents: 3_257_085,
        feeCents: 39_085,
        netCents: 3_218_000,
        status: 'repassado',
      }),
      makeRepasseRow({
        academyName: 'Alliance Litoral',
        studentCount: 128,
        grossCents: 2_018_219,
        feeCents: 24_219,
        netCents: 1_994_000,
        withheld: true,
        status: 'retido',
      }),
      makeRepasseRow({
        academyName: 'Choque BJJ Kids',
        studentCount: 47,
        grossCents: 697_368,
        feeCents: 8_368,
        netCents: 689_000,
        status: 'em_transito',
      }),
    ],
    ...overrides,
  };
}
