import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    // Used by drizzle-kit push/introspect only; migrations are applied
    // programmatically (src/lib/migrate.ts). Never `push` on shared envs.
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://tatame:tatame_dev@localhost:5432/tatame',
  },
  entities: {
    roles: {
      // Runtime roles are created by the hand-written 0000_roles migration.
      exclude: ['tatame_app', 'tatame_platform'],
    },
  },
  strict: true,
  verbose: true,
});
