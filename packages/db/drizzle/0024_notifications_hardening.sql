-- Notifications slice hardening (spec 010, NOT.1). Additive only: FORCE RLS
-- on the new tenant table so even the table owner is subject to the
-- fail-closed tenant policy (mirrors 0002/0016/0019/0022). The table is
-- deliberately NOT append-only: `read_at` mutates through mark-read, and the
-- 180-day retention policy (recorded debt) will eventually delete rows.
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
