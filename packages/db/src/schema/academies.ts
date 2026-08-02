import { sql } from 'drizzle-orm';
import { char, jsonb, pgPolicy, pgTable, text } from 'drizzle-orm/pg-core';
import { academyStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * The tenant root (platform-global class). Written only via the platform pool;
 * `tatame_app` may read exactly its own row (name, theme, status for the
 * blocking/read-only screens).
 */
export const academies = pgTable(
  'academies',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    city: text('city'),
    country: char('country', { length: 2 }).default('BR'),
    status: academyStatus('status').notNull().default('trial'),
    contactEmail: text('contact_email').notNull(),
    phone: text('phone'),
    logoUrl: text('logo_url'),
    /** 3-color white-label palette `{deep,vibrant,accent}` — shape not final. */
    theme: jsonb('theme'),
    ...timestamps,
  },
  (t) => [
    pgPolicy('academies_own_row_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.id} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
  ],
);
