-- Events slice hardening (spec 008, EVT.1–EVT.2). Additive only: FORCE RLS
-- on the two new tenant tables so even the table owner is subject to the
-- fail-closed tenant policies (mirrors 0002/0008/0011/0013/0016). Events and
-- registrations are deliberately NOT append-only (status mutates through the
-- draft→published→canceled / pending_payment→confirmed→canceled lifecycles);
-- transition truth is protected by the audit trail (events.event.*,
-- events.registration.*) written on the existing audit_append seam.
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_registrations" FORCE ROW LEVEL SECURITY;
