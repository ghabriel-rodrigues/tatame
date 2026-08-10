ALTER TABLE "academies" ADD COLUMN "brand_deep" varchar(7);--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "brand_vibrant" varchar(7);--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "brand_accent" varchar(7);--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "auto_notifications_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Defensive copy before dropping the placeholder: production never wrote the
-- jsonb `theme`, but dev seeds did — carry over only complete, already-valid
-- uppercase-hex triplets (anything else was placeholder noise, dropped).
UPDATE "academies" SET
  "brand_deep" = upper("theme"->>'deep'),
  "brand_vibrant" = upper("theme"->>'vibrant'),
  "brand_accent" = upper("theme"->>'accent')
WHERE upper("theme"->>'deep') ~ '^#[0-9A-F]{6}$'
  AND upper("theme"->>'vibrant') ~ '^#[0-9A-F]{6}$'
  AND upper("theme"->>'accent') ~ '^#[0-9A-F]{6}$';--> statement-breakpoint
ALTER TABLE "academies" DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_brand_deep_hex_ck" CHECK ("academies"."brand_deep" IS NULL OR "academies"."brand_deep" ~ '^#[0-9A-F]{6}$');--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_brand_vibrant_hex_ck" CHECK ("academies"."brand_vibrant" IS NULL OR "academies"."brand_vibrant" ~ '^#[0-9A-F]{6}$');--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_brand_accent_hex_ck" CHECK ("academies"."brand_accent" IS NULL OR "academies"."brand_accent" ~ '^#[0-9A-F]{6}$');--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_brand_all_or_none_ck" CHECK (num_nonnulls("academies"."brand_deep", "academies"."brand_vibrant", "academies"."brand_accent") IN (0, 3));--> statement-breakpoint
CREATE POLICY "academies_own_row_update" ON "academies" AS PERMISSIVE FOR UPDATE TO "tatame_app" USING ("academies"."id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academies"."id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);