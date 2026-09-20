import { eq, sql } from 'drizzle-orm';
import type { Database } from '../lib/client.js';
import { withPlatform } from '../lib/client.js';
import {
  academies,
  academySubscriptions,
  platformPlans,
} from '../schema/index.js';

export interface SeedPlatformConsoleHandles {
  platformDb: Database;
}

/**
 * Platform console fixtures (spec 012, PLT.2). Everything the plataforma
 * persona reads is cross-tenant and derived, so this seed adds only
 * platform-level rows — no classes, students or memberships — and leaves the
 * tenant fixture pipeline (`seedDevFixtures`) untouched.
 *
 * What it makes demoable on first login:
 * - **every academy status**: active (alpha), trial (bravo), delinquent
 *   (charlie, from the billing seed) and suspended (delta, added here);
 * - a **non-empty "Precisam de atenção" list**: bravo's trial is moved to end
 *   inside the 14-day attention window, charlie is already past due;
 * - a **6-month MRR chart with slope**: subscription rows are backdated to
 *   different months and delta's is canceled last month, so the series rises
 *   and the current month differs from the previous one. MRR counts `active`
 *   and `past_due` subscriptions only — a trial is not revenue.
 *
 * Requires `seedPlatformPlans`, `seedDevFixtures` and `seedBillingFixtures`
 * to have run first (it backdates the subscriptions those created).
 */

/** The suspended fixture — platform-level only, no tenant data behind it. */
const SUSPENDED_ACADEMY = {
  slug: 'delta-team',
  name: 'Delta Team BJJ',
  plan: 'Essencial',
  city: 'Curitiba / PR',
};

/** Days before/after today, per fixture, driving the demoable read models. */
const TRIAL_ENDS_IN_DAYS = 9; // plataforma-02: "Trial termina em 9 dias"
const MONTH_MS = 30 * 24 * 3600 * 1000;

const monthsAgo = (n: number) => new Date(Date.now() - n * MONTH_MS);

export async function seedPlatformConsoleFixtures({
  platformDb,
}: SeedPlatformConsoleHandles): Promise<void> {
  await withPlatform(platformDb, async (tx) => {
    const planIdByName = new Map<string, string>();
    for (const row of await tx
      .select({ id: platformPlans.id, name: platformPlans.name })
      .from(platformPlans)) {
      planIdByName.set(row.name, row.id);
    }
    const essencial = planIdByName.get(SUSPENDED_ACADEMY.plan);
    if (!essencial) {
      throw new Error(
        'Platform plans not seeded — run seedPlatformPlans first',
      );
    }

    // The suspended academy: access blocked by the AcademyStatusGuard, and
    // its subscription canceled — you suspend a customer and stop billing.
    const [suspended] = await tx
      .insert(academies)
      .values({
        name: SUSPENDED_ACADEMY.name,
        slug: SUSPENDED_ACADEMY.slug,
        status: 'suspended',
        contactEmail: `contato@${SUSPENDED_ACADEMY.slug}.tatame.dev`,
        city: SUSPENDED_ACADEMY.city,
      })
      .onConflictDoUpdate({
        target: academies.slug,
        set: {
          status: 'suspended',
          city: SUSPENDED_ACADEMY.city,
          updatedAt: new Date(),
        },
      })
      .returning({ id: academies.id });
    if (!suspended)
      throw new Error(`Failed to upsert academy ${SUSPENDED_ACADEMY.slug}`);

    const existing = await tx
      .select({ id: academySubscriptions.id })
      .from(academySubscriptions)
      .where(eq(academySubscriptions.academyId, suspended.id));
    if (existing.length === 0) {
      await tx.insert(academySubscriptions).values({
        academyId: suspended.id,
        platformPlanId: essencial,
        status: 'canceled',
        currentPeriodStart: monthsAgo(2),
        currentPeriodEnd: monthsAgo(1),
        canceledAt: monthsAgo(1),
        createdAt: monthsAgo(5),
      });
    }

    // Backdate the subscriptions the earlier seeds created at now(), so the
    // 6-month series has real history instead of one populated column.
    const backdate = async (
      slug: string,
      createdMonthsAgo: number,
    ): Promise<void> => {
      await tx
        .update(academySubscriptions)
        .set({ createdAt: monthsAgo(createdMonthsAgo) })
        .where(
          sql`${academySubscriptions.academyId} = (SELECT id FROM ${academies} WHERE ${academies.slug} = ${slug})`,
        );
    };
    await backdate('alpha-jj', 8);
    await backdate('charlie-fc', 4);

    // Bravo's trial ends inside the attention window (plataforma-02).
    await tx
      .update(academySubscriptions)
      .set({
        currentPeriodStart: new Date(
          Date.now() - (30 - TRIAL_ENDS_IN_DAYS) * 24 * 3600 * 1000,
        ),
        currentPeriodEnd: new Date(
          Date.now() + TRIAL_ENDS_IN_DAYS * 24 * 3600 * 1000,
        ),
        createdAt: monthsAgo(1),
      })
      .where(
        sql`${academySubscriptions.academyId} = (SELECT id FROM ${academies} WHERE ${academies.slug} = 'bravo-bjj')`,
      );
  });
}
