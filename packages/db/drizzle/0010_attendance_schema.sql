CREATE TYPE "public"."checkin_method" AS ENUM('qr', 'code', 'manual');--> statement-breakpoint
CREATE TYPE "public"."class_session_status" AS ENUM('scheduled', 'done', 'canceled');--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"method" "checkin_method" NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendances_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkin_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_session_id" uuid NOT NULL,
	"code" text NOT NULL,
	"qr_token" text NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_codes_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "checkin_codes_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "checkin_codes_code_digits_ck" CHECK ("checkin_codes"."code" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "checkin_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"starts_at" timestamp with time zone,
	"status" "class_session_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_sessions_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "class_sessions_tenant_class_date_uq" UNIQUE("tenant_id","class_id","session_date")
);
--> statement-breakpoint
ALTER TABLE "class_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_session_fk" FOREIGN KEY ("tenant_id","class_session_id") REFERENCES "public"."class_sessions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_codes" ADD CONSTRAINT "checkin_codes_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_codes" ADD CONSTRAINT "checkin_codes_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_codes" ADD CONSTRAINT "checkin_codes_session_fk" FOREIGN KEY ("tenant_id","class_session_id") REFERENCES "public"."class_sessions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_active_session_student_uq" ON "attendances" USING btree ("tenant_id","class_session_id","student_id") WHERE "attendances"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "attendances_tenant_session_idx" ON "attendances" USING btree ("tenant_id","class_session_id");--> statement-breakpoint
CREATE INDEX "attendances_tenant_student_idx" ON "attendances" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_codes_one_active_per_session_uq" ON "checkin_codes" USING btree ("tenant_id","class_session_id") WHERE "checkin_codes"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_codes_tenant_code_active_uq" ON "checkin_codes" USING btree ("tenant_id","code") WHERE "checkin_codes"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "class_sessions_tenant_date_idx" ON "class_sessions" USING btree ("tenant_id","session_date");--> statement-breakpoint
CREATE POLICY "attendances_tenant_select" ON "attendances" AS PERMISSIVE FOR SELECT TO "tatame_app" USING ("attendances"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "attendances_tenant_insert" ON "attendances" AS PERMISSIVE FOR INSERT TO "tatame_app" WITH CHECK ("attendances"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "checkin_codes_tenant_all" ON "checkin_codes" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("checkin_codes"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("checkin_codes"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "class_sessions_tenant_all" ON "class_sessions" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("class_sessions"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("class_sessions"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);