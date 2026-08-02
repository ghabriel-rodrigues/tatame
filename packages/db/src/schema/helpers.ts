import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * UUID v7 primary key, generated app-side (portable to PG < 18, time-ordered
 * for PK index locality — ticket 03 global conventions).
 */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

/** `created_at` / `updated_at` timestamptz pair; `updated_at` app-maintained. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Transaction-local tenant GUC set by `withTenant` — fail-closed when unset. */
export const currentTenantId = sql`NULLIF(current_setting('app.tenant_id', true), '')::uuid`;

/** Transaction-local user GUC set by `withTenant` — powers self policies. */
export const currentUserId = sql`NULLIF(current_setting('app.user_id', true), '')::uuid`;
