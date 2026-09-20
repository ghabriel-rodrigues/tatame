import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AcademyStatusService,
  AppModule,
  configureApp,
  NOTIFICATION_PORT,
  type PasswordResetNotification,
} from '@org/api';
import {
  academies,
  createAppDb,
  createPlatformDb,
  withPlatform,
  type DbHandle,
} from '@tatame/db';
import {
  createFreshDb,
  DEV_PASSWORD,
  seedBeltCatalog,
  seedBillingFixtures,
  seedDevFixtures,
  seedEventFixtures,
  seedNotificationFixtures,
  seedPlatformConsoleFixtures,
  seedPlatformPlans,
  seedReportFixtures,
  seedStoreFixtures,
  testAdminUrl,
  type FreshDb,
} from '@tatame/db/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';

export { DEV_PASSWORD };

export interface TestApp {
  app: INestApplication;
  /** BYPASSRLS handle for out-of-band setup/verification queries. */
  platformDb: DbHandle;
  /** RLS-enforced (`tatame_app`) handle — same posture as the API. */
  appDb: DbHandle;
  /** Password-reset notifications captured from the NotificationPort seam. */
  sentEmails: PasswordResetNotification[];
  http: () => request.Agent;
  /** Login helper; returns the response body (body transport). */
  login: (email: string, password?: string) => Promise<Record<string, any>>;
  academyIdBySlug: (slug: string) => Promise<string>;
  setAcademyStatus: (
    slug: string,
    status: 'trial' | 'active' | 'delinquent' | 'suspended',
  ) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Boots the REAL Nest application (full guard chain, RLS-enforced pools)
 * against a fresh migrated + seeded database on the shared Testcontainer.
 * Only the NotificationPort is overridden — with a recorder, so reset-token
 * emails can be asserted without any network.
 */
export async function createTestApp(overrides?: {
  /** Extra env for this app boot (e.g. PAYMENTS_PROVIDER=stripe gating). */
  env?: Record<string, string>;
}): Promise<TestApp> {
  const fresh: FreshDb = await createFreshDb(testAdminUrl());
  const appDb = createAppDb(fresh.url);
  const platformDb = createPlatformDb(fresh.url);
  await seedPlatformPlans(platformDb.db);
  // Shared belt catalog before the tenant fixtures — the GRD.5 graduation
  // histories resolve belts from it (spec 005).
  await seedBeltCatalog(platformDb.db);
  await seedDevFixtures({ appDb: appDb.db, platformDb: platformDb.db });
  // Billing fixtures (spec 006, BIL.5): plan catalog, charge histories,
  // mandates, and the charlie-fc delinquent academy (repasse retention).
  await seedBillingFixtures({ appDb: appDb.db, platformDb: platformDb.db });
  // Event fixtures (spec 008, EVT.3): draft + published free/paid events with
  // mixed registrations and their event-origin charges.
  await seedEventFixtures({ appDb: appDb.db, platformDb: platformDb.db });
  // Store fixtures (spec 009, STO.3): the prototype catalog (GI/RG/FX/TS/MC/
  // PB, PB low-stock) with mixed lifecycle orders and their order charges.
  await seedStoreFixtures({ appDb: appDb.db, platformDb: platformDb.db });
  // Notification fixtures (spec 010, NOT.2): mixed read/unread rows across
  // all five categories so the feed/badge surfaces are demoable.
  await seedNotificationFixtures({
    appDb: appDb.db,
    platformDb: platformDb.db,
  });
  // Platform console fixtures (spec 012, PLT.2): the suspended academy, the
  // trial ending inside the attention window, and backdated subscriptions so
  // the overview's 6-month series has real history.
  await seedPlatformConsoleFixtures({ platformDb: platformDb.db });
  // Report & ranking fixtures (spec 013, REP.2): the fixture aluno's full
  // locked profile plus the attendance/event/graduation spread that keeps the
  // five reports and both ranking segments non-empty with a distinct top 3.
  await seedReportFixtures({ appDb: appDb.db, platformDb: platformDb.db });

  process.env['DATABASE_URL'] = fresh.url;
  process.env['JWT_ACCESS_SECRET'] ??= 'e2e-jwt-secret-with-32-characters!!';
  process.env['NODE_ENV'] = 'test';
  delete process.env['RESEND_API_KEY']; // never depend on network in tests
  // Deterministic driver unless a spec overrides it (env-swap gating test).
  process.env['PAYMENTS_PROVIDER'] =
    overrides?.env?.['PAYMENTS_PROVIDER'] ?? 'simulated';
  for (const [key, value] of Object.entries(overrides?.env ?? {})) {
    process.env[key] = value;
  }

  const sentEmails: PasswordResetNotification[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(NOTIFICATION_PORT)
    .useValue({
      sendPasswordReset: async (input: PasswordResetNotification) => {
        sentEmails.push(input);
      },
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const http = () => request(app.getHttpServer());

  return {
    app,
    platformDb,
    appDb,
    sentEmails,
    http,
    login: async (email, password = DEV_PASSWORD) => {
      const res = await http()
        .post('/v1/auth/login')
        .send({ email, password, transport: 'body' });
      if (res.status !== 200 && res.status !== 202) {
        throw new Error(
          `login(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
      return res.body;
    },
    academyIdBySlug: async (slug) => {
      const rows = await withPlatform(platformDb.db, (tx) =>
        tx
          .select({ id: academies.id })
          .from(academies)
          .where(eq(academies.slug, slug)),
      );
      if (!rows[0]) throw new Error(`academy ${slug} not seeded`);
      return rows[0].id;
    },
    setAcademyStatus: async (slug, status) => {
      await withPlatform(platformDb.db, (tx) =>
        tx.update(academies).set({ status }).where(eq(academies.slug, slug)),
      );
      // The guard's 30 s status cache must not leak stale state into tests.
      app.get(AcademyStatusService).invalidate();
    },
    close: async () => {
      await app.close();
      await appDb.close();
      await platformDb.close();
      await fresh.drop();
    },
  };
}

/** Authorization header helper. */
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
