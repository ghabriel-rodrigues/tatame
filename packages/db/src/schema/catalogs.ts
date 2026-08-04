import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgPolicy,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { beltLadderKind } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Shared graduation catalogs (RLS class 3, ticket 03 / spec 005 GRD.1) — the
 * data-driven ladder: martial_arts → belt_ladders → belts. No `tenant_id`:
 * every academy reads the same rows (public SELECT policy for the app role);
 * writes happen only via migrations or the platform (BYPASSRLS) pool — the
 * hardening migration additionally revokes INSERT/UPDATE/DELETE from
 * `tatame_app`, so catalog mutation from a tenant is impossible by
 * construction. A new art (judo, karate) is future INSERTs, zero DDL.
 */

/** Martial art catalog — v1 seeds `bjj` only. */
export const martialArts = pgTable(
  'martial_arts',
  {
    id: id(),
    /** Stable machine key, e.g. `bjj`. */
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    ...timestamps,
  },
  () => [
    pgPolicy('martial_arts_public_select', { for: 'select', to: appRole, using: sql`true` }),
  ],
);

/** Belt ladder per art — BJJ ships `adult` and `kids` ladders. */
export const beltLadders = pgTable(
  'belt_ladders',
  {
    id: id(),
    martialArtId: uuid('martial_art_id')
      .notNull()
      .references(() => martialArts.id),
    kind: beltLadderKind('kind').notNull(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('belt_ladders_art_kind_uq').on(t.martialArtId, t.kind),
    pgPolicy('belt_ladders_public_select', { for: 'select', to: appRole, using: sql`true` }),
  ],
);

/**
 * Belts — ladder rows in promotion order. Colors are design-token SLUGS
 * (`belt.blue`), never hex (Lumira rule, resolved belt-tokenization ticket):
 * the design system owns the `color.belt.*` map, the DB owns the ladder.
 * `tip_color_slug` NULL = the component's default `belt.tip` ponteira; the
 * black belt sets `belt.red` (dan red tip). `max_degrees` 0 = no degree
 * stripes (red belt in v1).
 */
export const belts = pgTable(
  'belts',
  {
    id: id(),
    ladderId: uuid('ladder_id')
      .notNull()
      .references(() => beltLadders.id),
    /** Promotion order within the ladder, 1-based. */
    position: integer('position').notNull(),
    /** PT-BR display name (client copy), e.g. `Azul`. */
    name: text('name').notNull(),
    /** Design-token slug, e.g. `belt.blue` — never a hex literal. */
    colorSlug: text('color_slug').notNull(),
    /** Ponteira override slug; NULL = default `belt.tip`. */
    tipColorSlug: text('tip_color_slug'),
    maxDegrees: integer('max_degrees').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('belts_ladder_position_uq').on(t.ladderId, t.position),
    check('belts_max_degrees_ck', sql`${t.maxDegrees} >= 0`),
    check('belts_position_ck', sql`${t.position} >= 1`),
    pgPolicy('belts_public_select', { for: 'select', to: appRole, using: sql`true` }),
  ],
);
