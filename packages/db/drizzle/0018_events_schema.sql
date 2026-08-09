CREATE TYPE "public"."event_registration_status" AS ENUM('pending_payment', 'confirmed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'canceled');--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"confirmed_by_user_id" uuid NOT NULL,
	"status" "event_registration_status" NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_registrations_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "event_registrations_tenant_event_student_uq" UNIQUE("tenant_id","event_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "event_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"banner_preset" text DEFAULT 'event-purple-pink' NOT NULL,
	"location" text,
	"starts_at" timestamp with time zone,
	"price_cents" integer,
	"responsible_user_id" uuid NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "events_published_ck" CHECK ("events"."status" <> 'published' OR ("events"."starts_at" IS NOT NULL AND "events"."location" IS NOT NULL)),
	CONSTRAINT "events_price_ck" CHECK ("events"."price_cents" IS NULL OR "events"."price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_fk" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_registrations_tenant_student_idx" ON "event_registrations" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "events_tenant_status_starts_at_idx" ON "events" USING btree ("tenant_id","status","starts_at");--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_event_registration_fk" FOREIGN KEY ("tenant_id","event_registration_id") REFERENCES "public"."event_registrations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "event_registrations_tenant_all" ON "event_registrations" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("event_registrations"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("event_registrations"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "events_tenant_all" ON "events" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("events"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("events"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);