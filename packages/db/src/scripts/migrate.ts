/**
 * Applies all pending migrations to $DATABASE_URL.
 * Usage: pnpm nx run db:migrate   (or `pnpm --filter @tatame/db migrate`)
 */
import { runMigrations } from '../lib/migrate.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

runMigrations(databaseUrl)
  .then(() => {
    console.log('Migrations applied.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
