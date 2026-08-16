/**
 * Seeds the platform plan catalog and dev fixtures into $DATABASE_URL.
 * Assumes migrations are already applied and connects as a user allowed to
 * SET ROLE tatame_app / tatame_platform (superuser in dev).
 * Usage: pnpm nx run db:seed   (or `pnpm --filter @tatame/db seed`)
 */
import { createAppDb, createPlatformDb } from '../lib/client.js';
import {
  seedBeltCatalog,
  seedBillingFixtures,
  seedDevFixtures,
  seedEventFixtures,
  seedNotificationFixtures,
  seedPlatformConsoleFixtures,
  seedPlatformPlans,
  seedReportFixtures,
  seedStoreFixtures,
} from '../seed/index.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const app = createAppDb(databaseUrl);
const platform = createPlatformDb(databaseUrl);

try {
  await seedPlatformPlans(platform.db);
  console.log('Platform plan catalog seeded.');
  await seedBeltCatalog(platform.db);
  console.log('Belt catalog seeded.');
  await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Dev fixtures seeded.');
  await seedBillingFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Billing fixtures seeded.');
  await seedEventFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Event fixtures seeded.');
  await seedStoreFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Store fixtures seeded.');
  await seedNotificationFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Notification fixtures seeded.');
  await seedPlatformConsoleFixtures({ platformDb: platform.db });
  console.log('Platform console fixtures seeded.');
  await seedReportFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Report & ranking fixtures seeded.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.close();
  await platform.close();
}
