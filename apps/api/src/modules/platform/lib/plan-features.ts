import {
  PLATFORM_PLAN_FEATURE_SLUGS,
  type PlatformPlanFeatureSlug,
} from '@tatame/db';

/**
 * Platform plan feature registry (spec 012, PLT.7). Same split as the
 * permission registry: the slugs are the contract (and the database CHECK),
 * the PT-BR labels live here and ride the API, so the plan cards and the
 * plataforma-06 toggle rows render whatever the registry defines and there
 * is no client-side list to drift.
 */
export interface PlanFeature {
  slug: PlatformPlanFeatureSlug;
  label: string;
}

const LABELS: Record<PlatformPlanFeatureSlug, string> = {
  attendance: 'Presença e turmas',
  graduations: 'Graduações',
  pix_payments: 'Pagamentos Pix',
  store: 'Loja da academia',
  events: 'Eventos',
  full_finance: 'Financeiro completo',
  white_label: 'White-label',
  multi_unit: 'Multiunidades',
  advanced_reports: 'Relatórios avançados',
  api: 'API',
};

/** Registry order is display order — the toggle list of plataforma-06. */
export const PLAN_FEATURES: PlanFeature[] = PLATFORM_PLAN_FEATURE_SLUGS.map(
  (slug) => ({
    slug,
    label: LABELS[slug],
  }),
);

const KNOWN = new Set<string>(PLATFORM_PLAN_FEATURE_SLUGS);

export function isPlanFeatureSlug(
  value: string,
): value is PlatformPlanFeatureSlug {
  return KNOWN.has(value);
}

export function planFeatureLabel(slug: string): string {
  return isPlanFeatureSlug(slug) ? LABELS[slug] : slug;
}

/**
 * Registry order for a stored (unordered) feature set, so two plans with the
 * same features always render the same chip sequence.
 */
export function sortFeatureSlugs(
  slugs: readonly string[],
): PlatformPlanFeatureSlug[] {
  const held = new Set(slugs);
  return PLATFORM_PLAN_FEATURE_SLUGS.filter((slug) => held.has(slug));
}
