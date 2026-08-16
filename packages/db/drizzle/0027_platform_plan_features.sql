-- Platform plan features (spec 012, PLT.1): the `{invites,store,whiteLabel}`
-- jsonb blob no client ever read becomes a text[] of registry slugs, so the
-- plataforma-05 plan cards and the plataforma-06 feature toggles render from
-- one source. No implicit jsonb -> text[] cast exists, and the three seeded
-- rows are the only data, so the column is rebuilt and then backfilled onto
-- the slug sets that reproduce the prototype's cards.
ALTER TABLE "platform_plans" DROP COLUMN "features";--> statement-breakpoint
ALTER TABLE "platform_plans" ADD COLUMN "features" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint

-- Seeded catalog (idempotent — matched by name, no-op on an empty catalog;
-- `seedPlatformPlans` keeps these in sync from here on).
UPDATE "platform_plans"
   SET "features" = ARRAY['attendance', 'graduations', 'pix_payments']::text[]
 WHERE "name" = 'Essencial';--> statement-breakpoint
UPDATE "platform_plans"
   SET "features" = ARRAY['attendance', 'graduations', 'pix_payments', 'store', 'events', 'full_finance', 'white_label']::text[]
 WHERE "name" = 'Pro';--> statement-breakpoint
UPDATE "platform_plans"
   SET "features" = ARRAY['attendance', 'graduations', 'pix_payments', 'store', 'events', 'full_finance', 'white_label', 'multi_unit', 'advanced_reports', 'api']::text[]
 WHERE "name" = 'Black';--> statement-breakpoint

-- The registry boundary: an unknown slug can never enter the catalog, whoever
-- writes it. `<@` also accepts the empty array, which is a valid free plan.
ALTER TABLE "platform_plans" ADD CONSTRAINT "platform_plans_features_slug_ck" CHECK ("platform_plans"."features" <@ ARRAY['attendance', 'graduations', 'pix_payments', 'store', 'events', 'full_finance', 'white_label', 'multi_unit', 'advanced_reports', 'api']::text[]);
