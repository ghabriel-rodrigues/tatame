-- Store slice hardening (spec 009, STO.1–STO.2). Additive only: FORCE RLS
-- on the four new tenant tables so even the table owner is subject to the
-- fail-closed tenant policies (mirrors 0002/0016/0019). Catalog and order
-- tables are deliberately NOT append-only (status mutates through the
-- active→archived / pending→paid→ready→delivered→canceled lifecycles);
-- transition truth is protected by the audit trail (store.category.*,
-- store.product.*, store.order.*) written on the existing audit_append seam,
-- and money truth stays on billing's charges/payments rows.
ALTER TABLE "product_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
