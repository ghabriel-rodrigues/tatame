// @tatame/db — schema, migrations and tenant-aware client helpers.
// Consumed by apps/api (NestJS): schema for queries/types, createAppDb /
// createPlatformDb for the two pools, withTenant / withPlatform as the only
// sanctioned query paths.
export * as schema from './schema/index.js';
export * from './schema/index.js';
export {
  createAppDb,
  createPlatformDb,
  withTenant,
  withPlatform,
  type Database,
  type DbTransaction,
  type DbHandle,
  type CreateDbOptions,
  type TenantContext,
} from './lib/client.js';
export { runMigrations, migrationsFolder } from './lib/migrate.js';
