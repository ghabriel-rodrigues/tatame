import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

/** The transaction handle passed to `withTenant` / `withPlatform` callbacks. */
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Max pool size. */
  max?: number;
  /**
   * Role to `SET ROLE` into on every new connection. Defaults per factory
   * (`tatame_app` / `tatame_platform`). Pass `null` to keep the login role
   * (migrations / test admin usage).
   */
  role?: string | null;
}

function createHandle(databaseUrl: string, role: string | null, max: number): DbHandle {
  if (role !== null && !/^[a-z_][a-z0-9_]*$/.test(role)) {
    throw new Error(`Invalid database role name: ${role}`);
  }
  // The whole pool is dedicated to one role: the `role` GUC in the startup
  // packet is the SET ROLE equivalent, applied server-side before any query
  // (the login user must be a member of the role, or a superuser in dev/test).
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    ...(role !== null ? { options: `-c role=${role}` } : {}),
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/**
 * Pool for all tenant-persona traffic. Every connection runs as `tatame_app`
 * (RLS enforced, fail closed). All tenant reads/writes must go through
 * {@link withTenant} — the raw handle is intentionally not tenant-scoped.
 */
export function createAppDb(databaseUrl: string, options: CreateDbOptions = {}): DbHandle {
  return createHandle(databaseUrl, options.role === undefined ? 'tatame_app' : options.role, options.max ?? 10);
}

/**
 * Pool for the platform module only. Every connection runs as
 * `tatame_platform` (BYPASSRLS) — inject exclusively into platform-scope
 * providers, never into tenant feature modules (ticket 02).
 */
export function createPlatformDb(databaseUrl: string, options: CreateDbOptions = {}): DbHandle {
  return createHandle(
    databaseUrl,
    options.role === undefined ? 'tatame_platform' : options.role,
    options.max ?? 5,
  );
}

export interface TenantContext {
  /** Academy id — scopes RLS tenant policies (`app.tenant_id`). */
  tenantId?: string | null;
  /** Authenticated user id — powers self policies (`app.user_id`). */
  userId?: string | null;
}

/**
 * Runs `fn` inside a transaction whose first statements bind the RLS context
 * via transaction-local `set_config(..., true)` (equivalent to `SET LOCAL`) —
 * the connection returns to the pool clean, which stays correct under
 * PgBouncer transaction pooling. With the GUCs unset RLS fails closed.
 *
 * Accepts either a tenant id string or a {@link TenantContext} (e.g. platform
 * staff self-service flows may set only `userId`).
 */
export async function withTenant<T>(
  db: Database,
  context: string | TenantContext,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const ctx: TenantContext = typeof context === 'string' ? { tenantId: context } : context;
  return db.transaction(async (tx) => {
    if (ctx.tenantId != null) {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    }
    if (ctx.userId != null) {
      await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    }
    return fn(tx);
  });
}

/**
 * Runs `fn` in a transaction on the platform (BYPASSRLS) database. No tenant
 * GUC is set — cross-tenant by design; keep usage confined to the platform
 * module behind its role guard and audit interceptor.
 */
export async function withPlatform<T>(
  db: Database,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
