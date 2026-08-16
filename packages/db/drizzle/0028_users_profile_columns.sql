-- Aluno dados pessoais (spec 013, REP.1): additive nullable profile columns
-- on the auth-global users row — the profile describes the person, not the
-- tenant (one profile across academies; guardian/professor screens reuse it
-- later without migration). Format CHECKs mirror the client masks: CPF as 11
-- normalized digits (checksum service-validated), CEP as 8 digits, UF as 2
-- uppercase letters, gender constrained to a small fixed set. CPF/RG
-- write-once is service-enforced (product rule, future admin-unlock story);
-- no CPF uniqueness in v1 (cross-user dedupe recorded out of scope).
ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rg" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_state" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_zip" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_gender_ck" CHECK ("users"."gender" IS NULL OR "users"."gender" IN ('female', 'male', 'other', 'unspecified'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_cpf_format_ck" CHECK ("users"."cpf" IS NULL OR "users"."cpf" ~ '^[0-9]{11}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_address_zip_format_ck" CHECK ("users"."address_zip" IS NULL OR "users"."address_zip" ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_address_state_format_ck" CHECK ("users"."address_state" IS NULL OR "users"."address_state" ~ '^[A-Z]{2}$');