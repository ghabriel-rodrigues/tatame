import type { Database } from '../lib/client.js';
import { withPlatform } from '../lib/client.js';
import { platformPlans } from '../schema/index.js';

/**
 * Platform plan catalog (charter: Essencial / Pro / Black). Production data —
 * idempotent upsert keyed on the unique plan name. `feeBps` is the platform
 * take on academy revenue in basis points (spec 006) — dev pricing so the
 * repasse read model (gross × fee_bps → net) computes real numbers.
 *
 * `features` are registry slugs (spec 012, PLT.1); each tier is a superset of
 * the one below it, which is what makes the plataforma-05 cards render their
 * "Tudo do Essencial" / "Tudo do Pro" chips by derivation instead of a
 * stored inheritance pointer.
 */
export const PLATFORM_PLAN_CATALOG = [
  {
    name: 'Essencial',
    priceCents: 9_900,
    currency: 'BRL',
    studentLimit: 80,
    features: ['attendance', 'graduations', 'pix_payments'],
    sortOrder: 1,
    feeBps: 500,
  },
  {
    name: 'Pro',
    priceCents: 19_900,
    currency: 'BRL',
    studentLimit: 250,
    features: [
      'attendance',
      'graduations',
      'pix_payments',
      'store',
      'events',
      'full_finance',
      'white_label',
    ],
    sortOrder: 2,
    feeBps: 400,
  },
  {
    name: 'Black',
    priceCents: 34_900,
    currency: 'BRL',
    studentLimit: null,
    features: [
      'attendance',
      'graduations',
      'pix_payments',
      'store',
      'events',
      'full_finance',
      'white_label',
      'multi_unit',
      'advanced_reports',
      'api',
    ],
    sortOrder: 3,
    feeBps: 250,
  },
] as const;

/** Seeds/updates the platform plan catalog through the platform (BYPASSRLS) pool. */
export async function seedPlatformPlans(platformDb: Database): Promise<void> {
  await withPlatform(platformDb, async (tx) => {
    for (const plan of PLATFORM_PLAN_CATALOG) {
      await tx
        .insert(platformPlans)
        .values({
          name: plan.name,
          priceCents: plan.priceCents,
          currency: plan.currency,
          studentLimit: plan.studentLimit,
          features: [...plan.features],
          sortOrder: plan.sortOrder,
          isActive: true,
          feeBps: plan.feeBps,
        })
        .onConflictDoUpdate({
          target: platformPlans.name,
          set: {
            priceCents: plan.priceCents,
            studentLimit: plan.studentLimit,
            features: [...plan.features],
            sortOrder: plan.sortOrder,
            isActive: true,
            feeBps: plan.feeBps,
            updatedAt: new Date(),
          },
        });
    }
  });
}
