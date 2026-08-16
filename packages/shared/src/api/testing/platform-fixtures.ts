/**
 * Plataforma console fixtures (PLT.10-14, spec 012). Mirrors the dev seeds
 * (`packages/db/src/seed/platform.ts` + `dev.ts`) so web specs and the e2e
 * suite describe the same customer base: an active academy, a trial ending
 * inside the attention window, a delinquent one and a suspended one.
 */
import type {
  PlatformAcademyDetail,
  PlatformAcademyListResponse,
  PlatformAcademyRow,
  PlatformIntegrationsResponse,
  PlatformOverviewResponse,
  PlatformPlanCatalogResponse,
  PlatformPlanRow,
  PlatformTeamResponse,
} from '../types.js';

export const FIXTURE_PLATFORM_ACADEMIES: PlatformAcademyRow[] = [
  {
    id: '018f0000-0000-7000-8000-0000000ac001',
    name: 'Alpha Jiu-Jitsu',
    slug: 'alpha-jj',
    city: 'São Paulo / SP',
    status: 'active',
    studentCount: 214,
    planName: 'Pro',
    planPriceCents: 19_900,
    subscriptionStatus: 'active',
  },
  {
    id: '018f0000-0000-7000-8000-0000000ac002',
    name: 'Bravo BJJ Team',
    slug: 'bravo-bjj',
    city: 'Porto Alegre / RS',
    status: 'trial',
    studentCount: 64,
    planName: 'Essencial',
    planPriceCents: 9_900,
    subscriptionStatus: 'trialing',
  },
  {
    id: '018f0000-0000-7000-8000-0000000ac003',
    name: 'Charlie Fight Club',
    slug: 'charlie-fc',
    city: 'Santos / SP',
    status: 'delinquent',
    studentCount: 151,
    planName: 'Pro',
    planPriceCents: 19_900,
    subscriptionStatus: 'past_due',
  },
  {
    id: '018f0000-0000-7000-8000-0000000ac004',
    name: 'Delta Team BJJ',
    slug: 'delta-team',
    city: 'Curitiba / PR',
    status: 'suspended',
    studentCount: 47,
    planName: null,
    planPriceCents: null,
    subscriptionStatus: null,
  },
];

export function makePlatformOverview(
  overrides: Partial<PlatformOverviewResponse> = {},
): PlatformOverviewResponse {
  return {
    mrrCents: 1_924_000,
    mrrDeltaPct: 12,
    academyCount: 97,
    studentCount: 4_812,
    delinquencyPct: 3.1,
    series: [
      { month: '2026-03', cents: 1_192_000 },
      { month: '2026-04', cents: 1_308_000 },
      { month: '2026-05', cents: 1_423_000 },
      { month: '2026-06', cents: 1_539_000 },
      { month: '2026-07', cents: 1_712_000 },
      { month: '2026-08', cents: 1_924_000 },
    ],
    attention: [
      {
        academyId: FIXTURE_PLATFORM_ACADEMIES[1]!.id,
        academyName: 'Bravo BJJ Team',
        kind: 'trial_ending',
        reason: 'Trial termina em 9 dias',
      },
      {
        academyId: FIXTURE_PLATFORM_ACADEMIES[2]!.id,
        academyName: 'Charlie Fight Club',
        kind: 'subscription_overdue',
        reason: 'Assinatura vencida há 12 dias',
      },
    ],
    ...overrides,
  };
}

export function makePlatformAcademyList(
  academies: PlatformAcademyRow[] = FIXTURE_PLATFORM_ACADEMIES,
): PlatformAcademyListResponse {
  return { academies, total: academies.length };
}

export function makePlatformAcademyDetail(
  overrides: Partial<PlatformAcademyDetail> = {},
): PlatformAcademyDetail {
  return {
    ...FIXTURE_PLATFORM_ACADEMIES[0]!,
    createdAt: '2024-02-05T12:00:00.000Z',
    professorCount: 6,
    contactEmail: 'contato@alpha-jj.tatame.dev',
    pendingPlan: null,
    currentPeriodEnd: '2026-09-05T12:00:00.000Z',
    ...overrides,
  };
}

/** Registry order = display order, exactly as the API serves it. */
export const FIXTURE_PLAN_FEATURES = [
  { slug: 'attendance', label: 'Presença e turmas' },
  { slug: 'graduations', label: 'Graduações' },
  { slug: 'pix_payments', label: 'Pagamentos Pix' },
  { slug: 'store', label: 'Loja da academia' },
  { slug: 'events', label: 'Eventos' },
  { slug: 'full_finance', label: 'Financeiro completo' },
  { slug: 'white_label', label: 'White-label' },
  { slug: 'multi_unit', label: 'Multiunidades' },
  { slug: 'advanced_reports', label: 'Relatórios avançados' },
  { slug: 'api', label: 'API' },
];

/**
 * The catalog as the API derives it: cards carry only what each tier ADDS,
 * with `inheritsFrom` naming the plan it contains and `isMostSubscribed` on
 * the leader.
 */
export const FIXTURE_PLATFORM_PLANS: PlatformPlanRow[] = [
  {
    id: '018f0000-0000-7000-8000-0000000p1a01',
    name: 'Essencial',
    priceCents: 9_900,
    studentLimit: 80,
    features: FIXTURE_PLAN_FEATURES.slice(0, 3),
    academyCount: 31,
    isMostSubscribed: false,
    inheritsFrom: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: '018f0000-0000-7000-8000-0000000p1a02',
    name: 'Pro',
    priceCents: 19_900,
    studentLimit: 250,
    features: FIXTURE_PLAN_FEATURES.slice(3, 7),
    academyCount: 52,
    isMostSubscribed: true,
    inheritsFrom: 'Essencial',
    isActive: true,
    sortOrder: 2,
  },
  {
    id: '018f0000-0000-7000-8000-0000000p1a03',
    name: 'Black',
    priceCents: 34_900,
    studentLimit: null,
    features: FIXTURE_PLAN_FEATURES.slice(7),
    academyCount: 14,
    isMostSubscribed: false,
    inheritsFrom: 'Pro',
    isActive: true,
    sortOrder: 3,
  },
];

export function makePlatformPlanCatalog(
  overrides: Partial<PlatformPlanCatalogResponse> = {},
): PlatformPlanCatalogResponse {
  return {
    plans: FIXTURE_PLATFORM_PLANS,
    featureRegistry: FIXTURE_PLAN_FEATURES,
    ...overrides,
  };
}

/** plataforma-10: one owner, two support, one finance. */
export function makePlatformTeam(): PlatformTeamResponse {
  return {
    members: [
      {
        id: '018f0000-0000-7000-8000-0000000tm001',
        userId: '018f0000-0000-7000-8000-0000000us001',
        fullName: 'Marcos Kimura',
        email: 'marcos@tatame.app',
        role: 'owner',
        status: 'active',
      },
      {
        id: '018f0000-0000-7000-8000-0000000tm002',
        userId: '018f0000-0000-7000-8000-0000000us002',
        fullName: 'Paula Andrade',
        email: 'paula@tatame.app',
        role: 'support',
        status: 'active',
      },
      {
        id: '018f0000-0000-7000-8000-0000000tm003',
        userId: '018f0000-0000-7000-8000-0000000us003',
        fullName: 'Diego Ferreira',
        email: 'diego@tatame.app',
        role: 'support',
        status: 'active',
      },
      {
        id: '018f0000-0000-7000-8000-0000000tm004',
        userId: '018f0000-0000-7000-8000-0000000us004',
        fullName: 'Renata Lopes',
        email: 'renata@tatame.app',
        role: 'finance',
        status: 'active',
      },
    ],
  };
}

/** plataforma-11: read-only rails — `configurable: false` on every row. */
export function makePlatformIntegrations(): PlatformIntegrationsResponse {
  return {
    provider: 'simulated',
    integrations: [
      {
        key: 'pix',
        initials: 'PIX',
        name: 'Pix · PSP TatamePay',
        detail: 'Liquidação instantânea · taxa 0,9%',
        enabled: true,
        configurable: false,
      },
      {
        key: 'boleto',
        initials: 'BOL',
        name: 'Boleto · registradora',
        detail: 'Compensação em 1–2 dias úteis · R$ 2,90/boleto',
        enabled: true,
        configurable: false,
      },
      {
        key: 'card',
        initials: 'CRT',
        name: 'Cartão · adquirente',
        detail: 'Recorrência e parcelamento · 2,9% + R$ 0,30',
        enabled: true,
        configurable: false,
      },
    ],
  };
}
