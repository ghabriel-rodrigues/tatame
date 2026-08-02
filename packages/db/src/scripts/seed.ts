/**
 * Seeds the platform plan catalog and dev fixtures into $DATABASE_URL.
 * Assumes migrations are already applied and connects as a user allowed to
 * SET ROLE tatame_app / tatame_platform (superuser in dev).
 * Usage: pnpm nx run db:seed   (or `pnpm --filter @tatame/db seed`)
 */
import { createAppDb, createPlatformDb } from '../lib/client.js';
import { seedDevFixtures, seedPlatformPlans } from '../seed/index.js';

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
  await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
  console.log('Dev fixtures seeded.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.close();
  await platform.close();
}
