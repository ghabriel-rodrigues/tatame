import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Absolute path to this package's generated migrations folder. */
export const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'drizzle',
);

/**
 * Applies all pending migrations. Connect as the migrations owner role
 * (superuser in dev/test; a dedicated BYPASSRLS owner in production — the
 * SECURITY DEFINER auth functions must be owned by a role that bypasses RLS,
 * since every auth table is FORCE RLS).
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
