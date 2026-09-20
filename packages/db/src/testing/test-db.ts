import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from '../lib/migrate.js';

/** Superuser URI of the shared test container (set by global-setup.ts). */
export function testAdminUrl(): string {
  const url = process.env['TEST_PG_ADMIN_URL'];
  if (!url) {
    throw new Error(
      'TEST_PG_ADMIN_URL is not set — vitest globalSetup did not run',
    );
  }
  return url;
}

export interface FreshDb {
  /** Superuser URL of the fresh database (migrations owner in tests). */
  url: string;
  drop: () => Promise<void>;
}

/**
 * Creates a brand-new database on the shared test container and applies all
 * migrations to it. The connecting user is the container superuser, so
 * `SET ROLE tatame_app` / `tatame_platform` need no extra grants.
 */
export async function createFreshDb(adminUrl: string): Promise<FreshDb> {
  const dbName = `t_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const freshUrl = url.toString();

  await runMigrations(freshUrl);

  return {
    url: freshUrl,
    drop: async () => {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await client.end();
    },
  };
}
