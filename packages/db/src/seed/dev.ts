import { hash } from '@node-rs/argon2';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  academySubscriptions,
  credentials,
  memberships,
  platformPlans,
  platformUsers,
  rolePermissions,
  users,
  type membershipRole,
  type platformRole,
} from '../schema/index.js';

/** Known dev password for every seeded account. Never use outside dev. */
export const DEV_PASSWORD = 'TatameDev!123';

/** OWASP-recommended argon2id parameters (19 MiB, t=2, p=1). */
export function hashDevPassword(password: string): Promise<string> {
  return hash(password, {
    // Algorithm.Argon2id — literal because @node-rs/argon2 ships an ambient
    // const enum, which isolatedModules cannot import at runtime.
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

type MembershipRole = (typeof membershipRole.enumValues)[number];
type PlatformRole = (typeof platformRole.enumValues)[number];

interface DevAcademy {
  slug: string;
  name: string;
  status: 'trial' | 'active';
  plan: string;
  subscriptionStatus: 'trialing' | 'active';
  theme: Record<string, string>;
}

const DEV_ACADEMIES: DevAcademy[] = [
  {
    slug: 'alpha-jj',
    name: 'Alpha Jiu-Jitsu',
    status: 'active',
    plan: 'Pro',
    subscriptionStatus: 'active',
    theme: { deep: '#0B1F3A', vibrant: '#1E66F5', accent: '#F5A623' },
  },
  {
    slug: 'bravo-bjj',
    name: 'Bravo BJJ Team',
    status: 'trial',
    plan: 'Essencial',
    subscriptionStatus: 'trialing',
    theme: { deep: '#1A1A2E', vibrant: '#E94560', accent: '#0F3460' },
  },
];

interface DevUser {
  email: string;
  fullName: string;
  birthDate?: string;
  memberships: Array<{ academySlug: string; role: MembershipRole }>;
  platformRole?: PlatformRole;
}

const DEV_USERS: DevUser[] = [
  {
    email: 'aluno@tatame.dev',
    fullName: 'Ana Aluna',
    birthDate: '2000-03-15',
    memberships: [{ academySlug: 'alpha-jj', role: 'student' }],
  },
  {
    email: 'professor@tatame.dev',
    fullName: 'Paulo Professor',
    birthDate: '1988-07-02',
    memberships: [{ academySlug: 'alpha-jj', role: 'professor' }],
  },
  {
    email: 'admin@tatame.dev',
    fullName: 'Amanda Admin',
    birthDate: '1985-11-20',
    memberships: [{ academySlug: 'alpha-jj', role: 'admin' }],
  },
  {
    email: 'responsavel@tatame.dev',
    fullName: 'Renata Responsavel',
    birthDate: '1982-01-09',
    memberships: [{ academySlug: 'alpha-jj', role: 'guardian' }],
  },
  {
    // Multi-membership: professor in Alpha AND admin in Bravo (switch flows).
    email: 'multi@tatame.dev',
    fullName: 'Marcos Multi',
    birthDate: '1990-05-30',
    memberships: [
      { academySlug: 'alpha-jj', role: 'professor' },
      { academySlug: 'bravo-bjj', role: 'admin' },
    ],
  },
  {
    email: 'admin.bravo@tatame.dev',
    fullName: 'Bruno Bravo',
    birthDate: '1979-09-12',
    memberships: [{ academySlug: 'bravo-bjj', role: 'admin' }],
  },
  {
    email: 'owner@tatame.dev',
    fullName: 'Olivia Owner',
    memberships: [],
    platformRole: 'owner',
  },
  {
    email: 'suporte@tatame.dev',
    fullName: 'Samuel Suporte',
    memberships: [],
    platformRole: 'support',
  },
];

/** Default permission-toggle rows per academy (absent row = code default). */
const DEV_ROLE_PERMISSIONS: Array<{ role: MembershipRole; key: string; allowed: boolean }> = [
  { role: 'professor', key: 'events.create', allowed: true },
  { role: 'professor', key: 'invites.create', allowed: true },
  { role: 'student', key: 'store.purchase', allowed: true },
];

export interface SeedDevHandles {
  /** RLS-enforced pool (`tatame_app`) — tenant-scoped rows go through it. */
  appDb: Database;
  /** BYPASSRLS pool (`tatame_platform`) — global provisioning rows. */
  platformDb: Database;
}

/**
 * Dev fixtures: 2 academies with subscriptions, users covering all six
 * personas (+ a multi-membership user), argon2id-hashed known password.
 *
 * Global rows (academies, users, credentials, platform users, subscriptions)
 * are provisioned via the platform pool; tenant-scoped rows (memberships,
 * role_permissions) are written through `withTenant` on the app pool so the
 * RLS WITH CHECK path stays honest. Idempotent.
 */
export async function seedDevFixtures({ appDb, platformDb }: SeedDevHandles): Promise<void> {
  const secretHash = await hashDevPassword(DEV_PASSWORD);

  const academyIdBySlug = new Map<string, string>();
  const userIdByEmail = new Map<string, string>();

  await withPlatform(platformDb, async (tx) => {
    // Academies + subscriptions.
    for (const a of DEV_ACADEMIES) {
      const [academy] = await tx
        .insert(academies)
        .values({
          name: a.name,
          slug: a.slug,
          status: a.status,
          contactEmail: `contato@${a.slug}.tatame.dev`,
          city: 'Sao Paulo',
          theme: a.theme,
        })
        .onConflictDoUpdate({
          target: academies.slug,
          set: { name: a.name, status: a.status, theme: a.theme, updatedAt: new Date() },
        })
        .returning({ id: academies.id });
      if (!academy) throw new Error(`Failed to upsert academy ${a.slug}`);
      academyIdBySlug.set(a.slug, academy.id);

      const [plan] = await tx
        .select({ id: platformPlans.id })
        .from(platformPlans)
        .where(eq(platformPlans.name, a.plan));
      if (!plan) throw new Error(`Platform plan ${a.plan} not seeded — run seedPlatformPlans first`);

      const existing = await tx
        .select({ id: academySubscriptions.id })
        .from(academySubscriptions)
        .where(eq(academySubscriptions.academyId, academy.id));
      if (existing.length === 0) {
        await tx.insert(academySubscriptions).values({
          academyId: academy.id,
          platformPlanId: plan.id,
          status: a.subscriptionStatus,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
    }

    // Users + credentials + platform roles.
    for (const u of DEV_USERS) {
      const found = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${u.email.toLowerCase()}`);
      let userId = found[0]?.id;
      if (!userId) {
        const [inserted] = await tx
          .insert(users)
          .values({
            email: u.email.toLowerCase(),
            fullName: u.fullName,
            birthDate: u.birthDate,
          })
          .returning({ id: users.id });
        if (!inserted) throw new Error(`Failed to insert user ${u.email}`);
        userId = inserted.id;
      }
      userIdByEmail.set(u.email, userId);

      await tx
        .insert(credentials)
        .values({ userId, provider: 'password', secretHash })
        .onConflictDoUpdate({
          target: [credentials.userId, credentials.provider],
          set: { secretHash, updatedAt: new Date() },
        });

      if (u.platformRole) {
        await tx
          .insert(platformUsers)
          .values({ userId, role: u.platformRole })
          .onConflictDoUpdate({
            target: platformUsers.userId,
            set: { role: u.platformRole, updatedAt: new Date() },
          });
      }
    }
  });

  // Tenant-scoped rows through the RLS-enforced path (WITH CHECK honest).
  for (const a of DEV_ACADEMIES) {
    const tenantId = academyIdBySlug.get(a.slug);
    if (!tenantId) throw new Error(`Missing academy id for ${a.slug}`);

    await withTenant(appDb, tenantId, async (tx) => {
      for (const u of DEV_USERS) {
        for (const m of u.memberships) {
          if (m.academySlug !== a.slug) continue;
          const userId = userIdByEmail.get(u.email);
          if (!userId) throw new Error(`Missing user id for ${u.email}`);
          await tx
            .insert(memberships)
            .values({ tenantId, userId, role: m.role })
            .onConflictDoNothing({
              target: [memberships.tenantId, memberships.userId, memberships.role],
            });
        }
      }

      for (const p of DEV_ROLE_PERMISSIONS) {
        await tx
          .insert(rolePermissions)
          .values({ tenantId, role: p.role, permissionKey: p.key, allowed: p.allowed })
          .onConflictDoUpdate({
            target: [rolePermissions.tenantId, rolePermissions.role, rolePermissions.permissionKey],
            set: { allowed: p.allowed, updatedAt: new Date() },
          });
      }
    });
  }
}
