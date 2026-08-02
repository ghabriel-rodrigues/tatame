import { pgRole } from 'drizzle-orm/pg-core';

/**
 * Runtime DB roles (ticket 02 — tenant isolation).
 *
 * Both roles are created in the hand-written migration `0000_roles.sql`
 * (marked `.existing()` here so drizzle-kit does not try to manage them):
 * - `tatame_app`      — NOLOGIN, RLS-enforced; all tenant-persona traffic.
 * - `tatame_platform` — NOLOGIN, BYPASSRLS; platform module only.
 *
 * Connections authenticate as a login user and `SET ROLE` into one of these,
 * one dedicated pool per role (see `lib/client.ts`).
 */
export const appRole = pgRole('tatame_app').existing();
export const platformDbRole = pgRole('tatame_platform').existing();
