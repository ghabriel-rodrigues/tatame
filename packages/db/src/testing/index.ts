// Test-only surface of @tatame/db, consumed by apps/api-e2e (subpath export
// `@tatame/db/testing`). Ships the Testcontainers fresh-database helpers plus
// the seed fixtures so e2e suites run against the same data as dev.
export { createFreshDb, testAdminUrl, type FreshDb } from './test-db.js';
export {
  DEV_PASSWORD,
  hashDevPassword,
  seedDevFixtures,
  seedPlatformPlans,
  PLATFORM_PLAN_CATALOG,
  type SeedDevHandles,
} from '../seed/index.js';
