CREATE TYPE "public"."belt_ladder_kind" AS ENUM('adult', 'kids');--> statement-breakpoint
CREATE TYPE "public"."graduation_kind" AS ENUM('degree', 'belt', 'revocation');--> statement-breakpoint
CREATE TABLE "belt_ladders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"kind" "belt_ladder_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "belt_ladders_art_kind_uq" UNIQUE("martial_art_id","kind")
);
--> statement-breakpoint
ALTER TABLE "belt_ladders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "belts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ladder_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"color_slug" text NOT NULL,
	"tip_color_slug" text,
	"max_degrees" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "belts_ladder_position_uq" UNIQUE("ladder_id","position"),
	CONSTRAINT "belts_max_degrees_ck" CHECK ("belts"."max_degrees" >= 0),
	CONSTRAINT "belts_position_ck" CHECK ("belts"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "belts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "martial_arts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "martial_arts_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "martial_arts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "graduation_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"belt_id" uuid NOT NULL,
	"lessons_per_degree" integer DEFAULT 40 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graduation_rules_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "graduation_rules_tenant_belt_uq" UNIQUE("tenant_id","belt_id"),
	CONSTRAINT "graduation_rules_lessons_min_ck" CHECK ("graduation_rules"."lessons_per_degree" >= 10)
);
--> statement-breakpoint
ALTER TABLE "graduation_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_graduations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"belt_id" uuid NOT NULL,
	"kind" "graduation_kind" NOT NULL,
	"degree" smallint DEFAULT 0 NOT NULL,
	"awarded_by_user_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"reverses_graduation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_graduations_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "student_graduations_revocation_ck" CHECK (("student_graduations"."kind" = 'revocation') = ("student_graduations"."reverses_graduation_id" IS NOT NULL)),
	CONSTRAINT "student_graduations_degree_ck" CHECK ("student_graduations"."degree" >= 0)
);
--> statement-breakpoint
ALTER TABLE "student_graduations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_notes_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "student_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "min_belt_id" uuid;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "max_belt_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "belt_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "belt_degree" smallint;--> statement-breakpoint
ALTER TABLE "belt_ladders" ADD CONSTRAINT "belt_ladders_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "public"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belts" ADD CONSTRAINT "belts_ladder_id_belt_ladders_id_fk" FOREIGN KEY ("ladder_id") REFERENCES "public"."belt_ladders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_rules" ADD CONSTRAINT "graduation_rules_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_rules" ADD CONSTRAINT "graduation_rules_belt_id_belts_id_fk" FOREIGN KEY ("belt_id") REFERENCES "public"."belts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_graduations" ADD CONSTRAINT "student_graduations_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_graduations" ADD CONSTRAINT "student_graduations_belt_id_belts_id_fk" FOREIGN KEY ("belt_id") REFERENCES "public"."belts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_graduations" ADD CONSTRAINT "student_graduations_awarded_by_user_id_users_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_graduations" ADD CONSTRAINT "student_graduations_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_graduations" ADD CONSTRAINT "student_graduations_reverses_fk" FOREIGN KEY ("tenant_id","reverses_graduation_id") REFERENCES "public"."student_graduations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_graduations_tenant_student_idx" ON "student_graduations" USING btree ("tenant_id","student_id","awarded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_graduations_single_reversal_uq" ON "student_graduations" USING btree ("tenant_id","reverses_graduation_id") WHERE "student_graduations"."reverses_graduation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "student_notes_tenant_student_idx" ON "student_notes" USING btree ("tenant_id","student_id");--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_min_belt_id_belts_id_fk" FOREIGN KEY ("min_belt_id") REFERENCES "public"."belts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_max_belt_id_belts_id_fk" FOREIGN KEY ("max_belt_id") REFERENCES "public"."belts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_belt_id_belts_id_fk" FOREIGN KEY ("belt_id") REFERENCES "public"."belts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "belt_ladders_public_select" ON "belt_ladders" AS PERMISSIVE FOR SELECT TO "tatame_app" USING (true);--> statement-breakpoint
CREATE POLICY "belts_public_select" ON "belts" AS PERMISSIVE FOR SELECT TO "tatame_app" USING (true);--> statement-breakpoint
CREATE POLICY "martial_arts_public_select" ON "martial_arts" AS PERMISSIVE FOR SELECT TO "tatame_app" USING (true);--> statement-breakpoint
CREATE POLICY "graduation_rules_tenant_all" ON "graduation_rules" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("graduation_rules"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("graduation_rules"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "student_graduations_tenant_select" ON "student_graduations" AS PERMISSIVE FOR SELECT TO "tatame_app" USING ("student_graduations"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "student_graduations_tenant_insert" ON "student_graduations" AS PERMISSIVE FOR INSERT TO "tatame_app" WITH CHECK ("student_graduations"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "student_notes_tenant_all" ON "student_notes" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("student_notes"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("student_notes"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);