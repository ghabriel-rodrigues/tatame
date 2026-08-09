CREATE TYPE "public"."billing_recurrence" AS ENUM('monthly', 'quarterly', 'semiannual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."charge_origin" AS ENUM('plan', 'event', 'order');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('open', 'paid', 'overdue', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."mandate_status" AS ENUM('active', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'boleto', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('simulated', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "academy_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"recurrence" "billing_recurrence" NOT NULL,
	"due_day" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_plans_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "academy_plans_tenant_name_uq" UNIQUE("tenant_id","name"),
	CONSTRAINT "academy_plans_amount_ck" CHECK ("academy_plans"."amount_cents" > 0),
	CONSTRAINT "academy_plans_due_day_ck" CHECK ("academy_plans"."due_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
ALTER TABLE "academy_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "billing_customers_tenant_user_provider_uq" UNIQUE("tenant_id","user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid,
	"origin" charge_origin NOT NULL,
	"academy_plan_id" uuid,
	"event_registration_id" uuid,
	"order_id" uuid,
	"period_start" date,
	"period_end" date,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"due_date" date NOT NULL,
	"status" charge_status DEFAULT 'open' NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "charges_origin_ck" CHECK (("charges"."origin" = 'plan' AND "charges"."academy_plan_id" IS NOT NULL AND "charges"."event_registration_id" IS NULL AND "charges"."order_id" IS NULL)
       OR ("charges"."origin" = 'event' AND "charges"."event_registration_id" IS NOT NULL AND "charges"."academy_plan_id" IS NULL AND "charges"."order_id" IS NULL)
       OR ("charges"."origin" = 'order' AND "charges"."order_id" IS NOT NULL AND "charges"."academy_plan_id" IS NULL AND "charges"."event_registration_id" IS NULL)),
	CONSTRAINT "charges_plan_period_ck" CHECK ("charges"."origin" <> 'plan' OR "charges"."period_start" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_mandates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"payer_user_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "mandate_status" DEFAULT 'active' NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_mandate_id" text,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_mandates_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "payment_mandates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_payment_id" text,
	"provider_data" jsonb,
	"paid_at" timestamp with time zone,
	"receipt_url" text,
	"refunded_at" timestamp with time zone,
	"provider_refund_id" text,
	"refund_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academies" ADD COLUMN "provider_account_id" text;--> statement-breakpoint
ALTER TABLE "academy_subscriptions" ADD COLUMN "provider" "payment_provider";--> statement-breakpoint
ALTER TABLE "academy_subscriptions" ADD COLUMN "provider_customer_id" text;--> statement-breakpoint
ALTER TABLE "academy_subscriptions" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
ALTER TABLE "platform_plans" ADD COLUMN "fee_bps" integer;--> statement-breakpoint
ALTER TABLE "academy_plans" ADD CONSTRAINT "academy_plans_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_guardian_fk" FOREIGN KEY ("tenant_id","guardian_id") REFERENCES "public"."guardians"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_academy_plan_fk" FOREIGN KEY ("tenant_id","academy_plan_id") REFERENCES "public"."academy_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_mandates" ADD CONSTRAINT "payment_mandates_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_mandates" ADD CONSTRAINT "payment_mandates_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_mandates" ADD CONSTRAINT "payment_mandates_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."students"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_fk" FOREIGN KEY ("tenant_id","charge_id") REFERENCES "public"."charges"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_plans_tenant_id_idx" ON "academy_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "charges_tenant_status_due_date_idx" ON "charges" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "charges_tenant_student_idx" ON "charges" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_plan_cycle_uq" ON "charges" USING btree ("tenant_id","student_id","academy_plan_id","period_start") WHERE "charges"."origin" = 'plan';--> statement-breakpoint
CREATE INDEX "payment_mandates_tenant_student_idx" ON "payment_mandates" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_mandates_single_active_uq" ON "payment_mandates" USING btree ("tenant_id","student_id") WHERE "payment_mandates"."status" = 'active';--> statement-breakpoint
CREATE INDEX "payments_tenant_charge_idx" ON "payments" USING btree ("tenant_id","charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_uq" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_academy_plan_fk" FOREIGN KEY ("tenant_id","academy_plan_id") REFERENCES "public"."academy_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_academy_plan_fk" FOREIGN KEY ("tenant_id","academy_plan_id") REFERENCES "public"."academy_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "academy_plans_tenant_all" ON "academy_plans" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("academy_plans"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academy_plans"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_customers_tenant_all" ON "billing_customers" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("billing_customers"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("billing_customers"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "charges_tenant_all" ON "charges" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("charges"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("charges"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "payment_mandates_tenant_all" ON "payment_mandates" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("payment_mandates"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("payment_mandates"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "payments_tenant_all" ON "payments" AS PERMISSIVE FOR ALL TO "tatame_app" USING ("payments"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("payments"."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);