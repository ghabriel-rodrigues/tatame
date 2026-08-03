CREATE TYPE "public"."class_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "class_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"duration_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_schedules_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "class_schedules_tenant_class_weekday_time_uq" UNIQUE("tenant_id","class_id","weekday","start_time"),
	CONSTRAINT "class_schedules_weekday_ck" CHECK ("class_schedules"."weekday" BETWEEN 0 AND 6)
);
--> statement-breakpoint
ALTER TABLE "class_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"professor_user_id" uuid NOT NULL,
	"capacity" integer NOT NULL,
	"age_min" integer,
	"age_max" integer,
	"status" "class_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "enrollments_tenant_class_student_uq" UNIQUE("tenant_id","class_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "guardians_tenant_user_uq" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"guardian_id" uuid,
	"academy_plan_id" uuid,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "students_tenant_user_uq" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_professor_user_id_users_id_fk" FOREIGN KEY ("professor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_guardian_fk" FOREIGN KEY ("tenant_id","guardian_id") REFERENCES "public"."guardians"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classes_tenant_id_idx" ON "classes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "enrollments_tenant_student_idx" ON "enrollments" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "guardians_tenant_id_idx" ON "guardians" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "students_tenant_id_idx" ON "students" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "students_tenant_guardian_idx" ON "students" USING btree ("tenant_id","guardian_id");--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_class_fk" FOREIGN KEY ("tenant_id","class_id") REFERENCES "public"."classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "class_schedules_tenant_all" ON "class_schedules" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("class_schedules"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("class_schedules"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "classes_tenant_all" ON "classes" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("classes"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("classes"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "enrollments_tenant_all" ON "enrollments" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("enrollments"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("enrollments"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "guardians_tenant_all" ON "guardians" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("guardians"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("guardians"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "students_tenant_all" ON "students" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("students"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("students"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);