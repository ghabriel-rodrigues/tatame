# 009 — Store (Phase 9)

Status: ready-for-agent
Personas covered: Aluno, Professor, Admin da academia

## Problem Statement

The "Loja licenciada" is the last handoff pillar with zero substrate. The admin has no way to run the store the handoff promises — produtos with criar/editar/remover, preço and estoque com alerta baixo, categorias, pedidos walking pago→entregue, vendas do mês — so the admin-03/04/05/06 screens (stat tiles, category chips, product rows, the pedidos board and its status sheet, the produto form with categoria/tags/galeria) have nothing to render. On the consumer side the aluno perfil's "Loja da academia" shortcut and the home's product strip lead nowhere, and the professor perfil's Loja row is equally dead — the vitrine with busca + category chips (aluno-16/professor-13) and the product detail with gallery, tamanho, quantidade and "Comprar com Pix" (aluno-17/professor-14) were never built.

The money side is already waiting, by design: `charge_origin` includes `order`, and `charges.order_id` has been a plain nullable uuid since BIL.2 — the last of the two origin stubs, explicitly recorded as pending this slice's table for its composite-FK hardening (Phase 8 closed the `event_registration_id` twin). The billing rails this phase needs — Pix sheet, wallet payment creation, the gated simulate endpoint, the normalized provider-event handler — all exist and already settle plan and event charges. Until this phase lands, "Aluno e Professor consomem; compra Pix; retirada na recepção" is a README sentence with no rows behind it.

## Solution

Four tenant tables and one storefront shared by two personas close the loop.

`product_categories` is the admin's chip catalog ("+ Nova categoria", counts per chip). `products` carries what the admin-06 form asks for — nome, descrição, preço in integer cents, estoque with a per-product low-stock threshold feeding the "estoque baixo" tile, categoria, tags (the comma input rendered as #chips and searched by the vitrine), tamanhos as size-pill values — plus the v1 visual identity: a **letter monogram + gradient preset slug** exactly like the prototypes' GI/RG/FX tiles (no image upload in v1, recorded debt; the "Galeria de fotos" and "Foto 2 de 3" gallery are deterministic monogram-tile variants derived from the preset catalog). `orders` is one single-product purchase per row — buyer is any **student or professor membership** of the tenant — with a per-tenant `#2431`-style number, a `pending → paid → ready → delivered` lifecycle plus `canceled`, and the fixed "retirada na recepção" pickup note. `order_items` snapshots product, size, quantity and unit price at purchase time. `charges.order_id` becomes a composite tenant FK, closing the last BIL.2 stub with the same hardening pattern as Phase 8.

Buying rides the **existing** billing rails end to end, mirroring the event-origin precedent: "Comprar com Pix · R$ X" creates the order in `pending` plus an order-origin charge, the client opens the same Pix sheet (with the same simulate button), and settlement flows only through the normalized provider-event handler — extended so `payment.succeeded` on an order charge flips the order to `paid` **and decrements stock** (never on `pending`), and `payment.refunded` flips it to `canceled` **and restores stock**. The admin gets the Loja console — produtos tab per admin-03 (tiles, category chips, product rows), pedidos board per admin-04 with the status sheet per admin-05 (Recebido → Em andamento → Entregue; Cancelado triggers the audited refund and the stock restore rides the refund event), produto form per admin-06 — and a store-scoped "vendas do mês" aggregate that stays standalone (the billing Visão financeira keeps its all-payments derivation untouched). Aluno and professor share one storefront feature — vitrine with busca + a **working** category chip carousel and an unclipped grid (the two known prototype bugs are explicitly not reproduced), product detail with gallery dots, size pills, quantity stepper and the Pix CTA, and a Meus pedidos list with status chips and the retirada note — reached from the aluno home strip + perfil row and the professor perfil row, exactly where the prototypes put them.

## User Stories

### Admin — produtos e categorias

1. As an academy admin, I want a Loja page headed by three stat tiles — "R$ N vendas no mês", "N pedidos no mês", "N estoque baixo" — so that the store's health is one glance.
2. As an academy admin, I want a Produtos tab listing my products as rows — gradient monogram tile, name, category chip, price, "N em estoque · N vendidos", Editar — so that the catalog matches admin-03 exactly.
3. As an academy admin, I want a "Categorias da loja" section with one chip per category showing its product count and a "+ Nova categoria" action, so that categories are managed inline.
4. As an academy admin, I want to rename a category and to delete one only while no product references it, so that the chip catalog stays honest without orphaning products.
5. As an academy admin, I want a "Novo produto" / "Editar produto" form with nome, preço, estoque, categoria chips, tags (comma input), and the galeria showing the monogram-gradient tile with disabled "+ Foto" slots, so that the form matches admin-06 — photo upload visibly deferred, not faked.
6. As an academy admin, I want "Remover da loja" to archive the product (never hard-delete), so that order history referencing it stays intact.
7. As an academy admin, I want each product to carry a low-stock threshold with a sane default, so that "estoque baixo" means what I decided, per product.
8. As an academy admin, I want the "vendidos" count per product derived from real paid orders, so that the number is truth, not a counter.

### Admin — pedidos

9. As an academy admin, I want a Pedidos tab listing orders as rows — buyer monogram, "Nome · #2431", item summary with size and value and Pix, and a status chip (Recebido / Em andamento / Entregue / Cancelado) — so that the board matches admin-04.
10. As an academy admin, I want tapping an order to open the status sheet per admin-05 — item card with the retirada note, then the four status options with their descriptions and the current one marked "atual" — so that moving a pedido is one sheet.
11. As an academy admin, I want to advance a paid order to Em andamento (separando) and then Entregue (retirado pelo comprador), so that pago→entregue is my two-step workflow.
12. As an academy admin, I want selecting Cancelado on a paid or em-andamento order to refund the Pix through the audited refund path ("Estorno do Pix em até 1 dia útil"), with the order flipping to canceled and stock restored via the refund event, so that cancellation and money never disagree.
13. As an academy admin, I want unpaid (pending) orders kept off the pedidos board and out of the month tiles, so that the board only shows sales that actually happened.
14. As an academy admin, I want "vendas do mês" computed from settled order payments in my timezone, so that the tile reconciles with the wallet receipts.

### Aluno & Professor — vitrine

15. As an aluno, I want a "Loja da academia" strip on my home (first products + "Ver tudo"), so that the store finds me where I already am.
16. As an aluno, I want the "Loja da academia" row on my perfil (with its "Novo" pill) opening the vitrine, so that the perfil shortcut finally works.
17. As a professor, I want the "Loja da academia" row on my perfil opening the same vitrine, so that I consume the store exactly like the handoff says — per professor-13, the perfil row is my entry.
18. As a buyer (aluno or professor), I want the vitrine headed "Loja <academia> · Produtos oficiais · retirada na recepção" with a search field over name and tags, so that finding a product is typing.
19. As a buyer, I want a horizontally scrollable category chip row ("Tudo" + one chip per category) that actually scrolls and filters, so that the prototype's broken chip carousel is fixed, not reproduced.
20. As a buyer, I want a two-column product grid — gradient monogram tile, name, price, category label — fully visible without clipping, so that the prototype's clipped grid is fixed, not reproduced.
21. As a buyer, I want an honest empty state when search/filter matches nothing, so that the vitrine never fabricates products.

### Aluno & Professor — produto e compra

22. As a buyer, I want the product detail per aluno-17 — full-bleed gradient banner with the monogram and category chip, "Foto N de 3" indicator, gallery thumbnails switching the banner variant, name + price, description, #tag chips — so that one screen sells the product.
23. As a buyer, I want size pills (P/M/G/GG or whatever the product defines) shown only when the product has sizes, so that tamanho is a choice, not a guess.
24. As a buyer, I want a quantity stepper capped at the available stock, plus the "N em estoque · retirada na recepção da academia" line, so that I cannot order what does not exist.
25. As a buyer, I want "Comprar com Pix · R$ X" (price × quantity) to create my order and open the same Pix sheet I already know — QR, copia-e-cola, addressed "Pedido #NNNN · <produto>" — so that buying works like paying my mensalidade.
26. As a buyer in the simulated environment, I want "Simular pagamento" on that sheet to settle instantly, flip my order to Recebido and show "Pedido pago — retire na recepção da academia.", so that the paid flow is demonstrable end to end.
27. As a buyer, I want a Meus pedidos list — "#2431 · <produto> · tam/qtd", status chip, and the retirada note — so that I always know what to pick up at the recepção.
28. As a buyer, I want to cancel an order that is still awaiting payment (canceling its open charge), so that abandoning a purchase is clean.
29. As an aluno, I want my store payments to appear in the Carteira histórico with a comprovante, so that pedido money and mensalidade money share one record; as a professor (no Carteira), Meus pedidos is my record.

### Integrity & cross-cutting

30. As the platform, I want all four store tables tenant-scoped with forced RLS and composite tenant FKs, so that catalogs and orders never leak across academies.
31. As the platform, I want only active products visible and purchasable on the storefront, so that archived products exist only in history.
32. As the platform, I want order settlement, stock decrement and stock restore driven only by normalized provider events, so that the Stripe swap stays a driver-only change.
33. As the platform, I want stock decremented exactly once per order at `paid` and restored exactly once at `canceled`-after-paid, idempotent under event re-delivery, so that inventory and re-sent webhooks never disagree.
34. As the platform, I want order creation validated against current stock but no reservation on pending orders, so that unpaid orders never lock inventory — accepting that concurrent settlements can briefly drive stock negative, surfaced on the admin board rather than hidden.
35. As the platform, I want the professor's store access to be strictly consumer-side — zero `/admin/store` routes, enforced by CI metadata assertions — so that "professor has no financial access" survives the professor buying a kimono.
36. As the platform, I want order status transitions and product/category mutations audited with impersonation attribution, so that who moved, archived or repriced anything is always answerable.
37. As the platform, I want a read-only (delinquent) academy to block store management and new orders while still allowing payment of an existing order charge, so that the established bypass rule holds unchanged.

## Implementation Decisions

### Schema — four tables, one relaxation, one hardening

- **New enum**: `order_status` (`pending`,`paid`,`ready`,`delivered`,`canceled`). PT-BR labels are client copy: pending = "Aguardando pagamento" (buyer-side only), paid = "Recebido", ready = "Em andamento", delivered = "Entregue", canceled = "Cancelado".
- **`product_categories`** (tenant-scoped, forced RLS, `UNIQUE (tenant_id, id)`): `name`, UNIQUE (tenant_id, name). Delete allowed only when no product references it (restrict FK + stable error); rename allowed.
- **`products`** (tenant-scoped, forced RLS, `UNIQUE (tenant_id, id)`): `name`; `description` nullable; `price_cents integer NOT NULL`; `stock_qty integer NOT NULL DEFAULT 0`; `low_stock_threshold integer NOT NULL DEFAULT 5` ("estoque baixo" = active AND `stock_qty <= low_stock_threshold`; derived, no flag column); `category_id` composite FK→product_categories nullable; `tags text[] NOT NULL DEFAULT '{}'` (comma input in the form, #chips + search on read); `sizes text[] NOT NULL DEFAULT '{}'` (empty = product has no sizes; UI seeds P/M/G/GG); **`monogram` text NOT NULL** (1–3 letters, auto-derived from the name at creation, stored so seeds can pin the prototype's GI/RG/FX/TS/MC/PB); **`gradient_preset` text slug** resolved by the design-system gradient catalog (same mechanism as `events.banner_preset`; default cycles the catalog); `status` (`active`,`archived`) default active + `archived_at`. Index (tenant_id, status).
- **Gallery is derivation, not schema**: the detail's 3 "fotos" are the product's preset plus 2 deterministic catalog-neighbor variants, computed client-side from `gradient_preset` + `monogram`. Image upload is a **recorded debt** (matches the handoff backlog); the admin form renders the disabled "+ Foto" slots.
- **`orders`** (tenant-scoped, forced RLS, `UNIQUE (tenant_id, id)`): **`number` integer NOT NULL + UNIQUE (tenant_id, number)** — per-tenant sequential, assigned max+1 in the creation transaction, rendered `#2431`; **`buyer_user_id` FK→users NOT NULL** — service validates an active student **or** professor membership in the tenant (the two consuming personas; no buyer FK to students because professors buy too); `status` default `pending`; `total_cents`; `pickup_note` text NOT NULL default `'Retirada na recepção'` (fixed copy in v1, a column so per-order notes need no migration); `canceled_at`. Index (tenant_id, status, created_at) for the board; index (tenant_id, buyer_user_id) for Meus pedidos. **No `charge_id` column** — the linkage lives on the charge (billing owns money rows, same direction as events).
- **`order_items`** (tenant-scoped, forced RLS): composite FKs to orders and products; `size` text nullable — must be one of the product's `sizes` when non-empty (service-validated); `quantity integer NOT NULL CHECK > 0`; `unit_price_cents integer NOT NULL` (snapshot at purchase — repricing never rewrites history). v1 orders have exactly one item (single-product purchase per the prototype), but the table keeps the designed shape so a cart is additive later.
- **`charges.order_id` hardening**: the BIL.2 plain-uuid stub becomes a composite `(tenant_id, order_id)` FK onto `orders` — the last origin stub, same pattern and precedent as Phase 8's `event_registration_id` and Phase 3's `invites.class_id`; the per-origin CHECK is already in place.
- **`charges.student_id` relaxation**: becomes nullable with CHECK `origin = 'order' OR student_id IS NOT NULL` — order charges are addressed by the order's buyer, and a professor buyer has no student row. Order charges of a student buyer still set `student_id` so the Carteira histórico picks them up; professor order charges leave it NULL. `guardian_id` stays NULL on order charges (no responsável store in v1).
- **Recorded deltas against database ticket 03**: `orders.charge_id` is dropped in favor of `charges.order_id` (linkage direction reversed per BIL.2, same as events); `products.images jsonb` is replaced by `monogram` + `gradient_preset` (no upload v1); `stock` is named `stock_qty` and gains `low_stock_threshold`; `tags`/`sizes` arrays and `orders.number`/`pickup_note` are additive; order statuses match the ticket verbatim.

### The store module

- A new `store` backend module behind the existing guard chain (JWT → persona role → academy status), owning categories, products, orders and the storefront. Money stays in billing: the store service asks billing to issue/cancel/refund order-origin charges through the same internal service seam events already uses — store never touches the provider port.
- Endpoint surface (versioned prefix, generated into the OpenAPI spec). Storefront routes are **shared** and role-gated to student + professor — one feature, two shells:

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /admin/store/overview` | admin | vendas do mês, pedidos no mês, estoque-baixo count |
| `GET/POST/PATCH/DELETE /admin/store/categories` | admin | chip catalog CRUD (delete restricted to empty categories) |
| `GET /admin/store/products` | admin | rows with stock, vendidos (derived), category |
| `POST /admin/store/products` · `PATCH /admin/store/products/:id` (+ archive) | admin | form per admin-06; "Remover da loja" = archive |
| `GET /admin/store/orders` | admin | board — paid/ready/delivered/canceled only, newest first |
| `POST /admin/store/orders/:id/status` | admin | `ready`/`delivered` transitions; `canceled` runs the audited refund |
| `GET /store/products` | student, professor | vitrine — active products, `?search=` over name+tags, `?categoryId=` filter |
| `GET /store/products/:id` | student, professor | detail — gallery derivation inputs, sizes, stock, price |
| `POST /store/orders` | student, professor | productId + size? + quantity → pending order + order-origin charge (returns chargeId) |
| `GET /store/orders` | student, professor | Meus pedidos (own orders, status chips, pickup note) |
| `DELETE /store/orders/:id` | student, professor | cancel own pending order (cancels the open charge) |
| `POST /store/charges/:id/payments` | student, professor | Pix payment on an own order charge — persona-neutral twin of the wallet route |

- Existing endpoints extended, not duplicated: `GET /aluno/home` gains `storeStrip` (first 3 active products — the prototype's strip count) and the perfil payloads stay client-side (the Loja rows are navigation, not data). The **simulate endpoint** gains the professor role (still `@BypassReadOnly`, still 404 unless the simulated provider is configured); authorization remains ownership of the underlying charge. The aluno Carteira histórico naturally includes order payments (they are payments on charges with `student_id` set).
- Vendas do mês is a **standalone store aggregate**, not folded into billing: `GET /admin/store/overview` sums succeeded payments on order-origin charges by `paid_at` in the tenant timezone; the billing Visão financeira keeps its existing all-succeeded-payments derivation untouched (store revenue flows into receita by construction — no billing change, nothing double-counted, each screen owns its number). "Pedidos no mês" counts orders that reached `paid` in the month; "vendidos" per product sums `order_items.quantity` across paid/ready/delivered orders. All derived on read, no counters.

### Purchase flow — order-origin charges over the billing rails

- **Create**: `POST /store/orders` validates active product, size ∈ sizes (required iff the product has sizes), `quantity ≤ stock_qty` (stable error otherwise, no partial fulfillment), then in one transaction assigns the order number, writes order + item with the price snapshot, and asks billing for a charge — `origin = 'order'`, `order_id` set, `amount_cents = total_cents`, `due_date` = today in the tenant timezone, `student_id` = the buyer's student row when the buyer is a student. The response carries the chargeId; the client drives `POST /store/charges/:id/payments` (pix — the only store method in v1, per the prototype's single CTA) and the existing Pix sheet + simulate button, addressed "Pedido #NNNN · <produto>".
- **The normalized provider-event handler is extended, not forked**: `payment.succeeded` on an order-origin charge settles the charge (existing behavior) *and* flips the order `pending → paid` *and* decrements `stock_qty` by the item quantity; `payment.refunded` flips the order to `canceled` *and* restores the stock. Both transitions are idempotent under re-delivery (guarded by the order-status transition itself — a `paid` order is not re-decremented, a `canceled` order not re-restored). This is the only settlement path — simulate today, Stripe webhook at swap, driver-only invariant preserved.
- **No reservation on pending**: stock moves only at `paid`. Order creation checks stock, but two pending orders can race to settlement; the loser drives `stock_qty` negative rather than failing a paid payment — recorded, accepted for v1 (single-product purchases, low volume), and visible on the admin board/tile so the admin resolves it at the counter. No auto-expiry of pending orders in v1 (mirrors events).
- **Admin transitions**: `paid → ready → delivered` via the status endpoint (audited; no skipping, no backward moves; `delivered` is terminal). `canceled` from `paid`/`ready` triggers the **existing audited full-refund** through the provider port; the order flip + stock restore ride the resulting `payment.refunded` event (instant under the simulated driver, so the sheet feels synchronous). Admin never sets `paid` by hand — payment truth comes only from the handler. Buyer cancel is `pending`-only and cancels the open charge; a paid order is undone only by the admin refund path.
- **Read-only (delinquent) academies**: store management and `POST /store/orders` are blocked like every write; paying an **existing** order charge still works via the `@BypassReadOnly` payment routes — the established rule, unchanged.

### Events, audit, errors

- Domain events (notifications stays listener-only): `store.order.paid` (the buyer's "pedido pago" receipt payload), `store.order.ready`, `store.order.delivered`, `store.order.canceled` (refund variant flags estorno), and `store.product.low_stock` (emitted when a paid decrement crosses the threshold — the future admin alert; no delivery in v1).
- Audit action codes on the existing seam, in-transaction: `store.category.created/updated/deleted`, `store.product.created/updated/archived`, `store.order.created/canceled`, `store.order.status_changed` (with from→to), plus the refund path already audited by billing — all with impersonation attribution.
- New stable problem+json codes: insufficient stock, size required / size invalid for product, product archived or not purchasable, order not cancelable (already paid), invalid status transition, category not empty on delete, charge not payable by caller. Cross-tenant/foreign ids → 404 per the established pattern.

### Client scope split

- **Web (admin console)**: a Loja area (`/admin/loja` + nav link) per admin-03/04/05/06 adapted to the console shell — header stat tiles; Produtos tab with the "Categorias da loja" chip row (+ Nova categoria inline create, rename, guarded delete) and product rows (monogram gradient tile, category chip, price, "N em estoque · N vendidos", Editar); produto form sheet (nome, preço, estoque + threshold, categoria chips, tags comma input → #chips, galeria with the monogram tile and disabled "+ Foto" slots, Salvar alterações, Remover da loja = archive with confirm); Pedidos tab with the board rows and status chips per admin-04 and the status sheet per admin-05 (item card + retirada note, four options with descriptions, "atual" marker, Cancelado confirm mentioning the estorno).
- **Mobile (RN, Android, iOS)**, each a tracked parity task, one **shared storefront feature mounted in both the aluno and professor shells** (placement per the prototypes: aluno home "Loja da academia" strip with "Ver tudo" + aluno perfil row with the "Novo" pill; professor perfil "Loja da academia" row — no professor tab-bar change): vitrine per aluno-16/professor-13 — header with retirada subtitle, busca, **working** category chip carousel ("Tudo" + chips, horizontally scrollable), unclipped 2-column grid, empty state; product detail per aluno-17/professor-14 — gradient banner + monogram + category chip, "Foto N de 3", 3 thumbnail variants, #tags, size pills (hidden when sizeless), quantity stepper capped at stock, stock + retirada line, "Comprar com Pix · R$ X" → existing Pix sheet + simulate → success toast "Pedido pago — retire na recepção da academia."; Meus pedidos (entry from the vitrine) with "#NNNN · produto · tam/qtd", status chips and the retirada note, plus pending orders offering cancel.
- **Prototype bugs and copy explicitly not reproduced**: the broken category chip carousel and the clipped product grid (aluno-16/professor-13) are fixed; professor-14's "desconto de equipe" line is dropped — no discount engine exists and the UI must not promise one (recorded).
- Copy is fixed by the prototypes, PT-BR client-side: "Loja da academia", "Produtos oficiais · retirada na recepção", "Buscar por nome ou tag", "Novo produto", "Editar produto", "Salvar alterações", "Remover da loja", "+ Nova categoria", "vendas no mês", "pedidos no mês", "estoque baixo", "N em estoque · N vendidos", "Tamanho", "Quantidade", "Comprar com Pix · R$ X", "Pedido pago — retire na recepção da academia.", "Recebido"/"Em andamento"/"Entregue"/"Cancelado" with their sheet descriptions, "Estorno do Pix em até 1 dia útil". Tiles and chips use Lumira gradient/color tokens — no hardcoded hex. Schema, enums, event names and audit actions stay English per charter.

## Testing Decisions

- Same doctrine as specs 001–008 (their suites are the prior art): behavior through the API against real Postgres with RLS active; assertions on status codes, stable error codes and observable state — never on SQL or driver internals.
- Catalog e2e: category create/rename, delete blocked while referenced then allowed when empty; product create with tags/sizes/threshold; archive hides from the vitrine but keeps order history readable; vitrine search over name+tags and category filter; storefront never returns archived products.
- Purchase e2e: order create → number assigned, price snapshot, pending + order-origin charge with hardened FK and correct addressing (student buyer sets `student_id`, professor buyer leaves it NULL) → Pix payment → simulate → charge paid *and* order `paid` *and* stock decremented, exactly once under duplicated event delivery; refund → order canceled + stock restored, idempotent; oversell race (two pendings, one stock) settles both and drives stock negative — asserted as the recorded behavior; qty > stock and wrong/missing size rejected with their stable codes; buyer cancel of pending cancels the charge, cancel of paid rejected.
- Admin flow e2e: board excludes pending; `paid→ready→delivered` transitions audited with from→to; invalid transitions rejected; admin `canceled` runs the refund and lands the flip through the handler; overview aggregates (vendas do mês tenant-tz, pedidos no mês, estoque baixo, vendidos per product) asserted against seeded fixtures; low_stock event emitted exactly on threshold crossing.
- Contract tests pin the extended normalized-event handler (order-origin succeeded/refunded transitions + stock effects, idempotent re-delivery) so the Stripe swap stays a driver-only PR.
- RBAC + RLS: professor reaches every `/store/*` route and zero `/admin/store/*` routes (CI metadata assertion); guardian/responsável and platform roles denied the storefront; cross-tenant product/order/charge ids → 404 via the fail-closed meta-test pattern; buyers see and pay only their own orders/charges; read-only academy blocks management and new orders but pays an existing order charge; simulate honors the professor role and keeps its 404 gating.
- Web: component spec for the Loja pages (tiles, category chip CRUD states, product row/form including the disabled galeria slots, board chip mapping, status sheet transitions and the Cancelado confirm) per the established page-spec pattern.
- Mobile: pure-logic tests for the detail purchase state machine (sizeless/sized × stock levels → pill/stepper/CTA state) and the status-chip label mapping; one integration test per client for vitrine → detail → Comprar com Pix → simulate → Meus pedidos "Recebido" round trip.

## Out of Scope

- Product image uploads — v1 visuals are letter monograms on design-system gradient presets; upload is a recorded debt (galeria slots render disabled).
- Stock per size/variant (explicit handoff backlog), stock reservation on pending orders, and any inventory movement ledger.
- Cart / multi-product orders — single-product purchase per the prototype; `order_items` keeps the shape so a cart is additive.
- Delivery/shipping — retirada na recepção is the only fulfillment; the pickup note is fixed copy.
- Boleto/cartão for store purchases (Pix-only per the prototype CTA), partial refunds, and discounts — professor-14's "desconto de equipe" copy is dropped, recorded.
- Responsável and platform storefronts; platform-level store configuration; store enable/disable toggle.
- Notification delivery — `store.*` domain events emit only; push/e-mail is the notifications phase.
- Sales reports beyond the three overview tiles ("Relatórios" owns exports).

## Further Notes

- This phase consumes the last BIL.2 origin stub (`charges.order_id`) and the dead Loja entry points recorded since the shells landed (aluno home strip, aluno/professor perfil rows) — update the README notes accordingly. With it, all three `charge_origin` values have real rows behind them.
- UI truth: admin-03 (produtos + categorias), admin-04 (pedidos board), admin-05 (status sheet), admin-06 (produto form), aluno-16/professor-13 (vitrine — minus the two known bugs), aluno-17/professor-14 (produto detail) — recreated pixel-faithful with Lumira tokens through the design-system package; monogram tiles reuse the events gradient-preset catalog mechanism.
- Amounts are integer cents in schema and API; clients format `R$` in pt-BR locale; order totals are always `unit_price_cents × quantity` from the snapshot, never the live product price.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] STO.1 DB: order_status enum + product_categories (UNIQUE tenant+name, restrict-delete) + products (price_cents, stock_qty + low_stock_threshold, category FK, tags/sizes arrays, monogram + gradient_preset, active/archived) with forced tenant RLS
- [ ] STO.2 DB: orders (per-tenant number, buyer_user_id student-or-professor, pending→paid→ready→delivered + canceled, pickup note) + order_items (size, qty, unit_price snapshot) + charges.order_id composite-FK hardening closing the last BIL.2 stub + charges.student_id order-origin relaxation
- [ ] STO.3 DB: dev seeds — prototype category/product catalog (GI/RG/FX/TS/MC/PB monograms, tags, sizes, one low-stock product) with mixed orders (pending, paid, ready, delivered, canceled+refunded) and their order-origin charges per fixture academy
- [ ] STO.4 Backend: store module admin — categories CRUD (guarded delete), products CRUD + archive, overview aggregates (vendas do mês tenant-tz, pedidos no mês, estoque baixo, vendidos derived)
- [ ] STO.5 Backend: storefront shared student+professor — vitrine list (search name+tags, category filter, active only), product detail, order creation (stock/size validation, number, snapshot) issuing the order-origin charge, store payment route + professor simulate role, Meus pedidos, pending cancel
- [ ] STO.6 Backend: orders lifecycle — normalized-event handler extended (succeeded→paid+stock decrement, refunded→canceled+restore, idempotent), admin board + ready/delivered transitions, admin cancel via audited refund, store.* domain events + low_stock emission + audit codes
- [ ] STO.7 Backend: e2e suite green — catalog CRUD + vitrine scoping, full Pix purchase through the handler contract, stock decrement/restore idempotency + oversell race, transition matrix + board exclusions, overview math, RBAC/RLS/read-only + CI route assertions (professor consumer-only)
- [ ] STO.8 Web: /admin/loja Produtos — stat tiles, categorias chip row with nova/rename/guarded-delete, product rows per admin-03, produto form per admin-06 (categoria chips, tags→#chips, galeria monogram + disabled + Foto slots, Remover da loja = archive)
- [ ] STO.9 Web: /admin/loja Pedidos — board per admin-04 (Recebido/Em andamento/Entregue/Cancelado chips, pending excluded), status sheet per admin-05 with atual marker, transitions and Cancelado→refund confirm
- [ ] STO.10 RN: shared vitrine + detail in both shells — aluno home Loja strip + perfil row, professor perfil row, vitrine per aluno-16/professor-13 with working chip carousel and unclipped grid, detail per aluno-17 (gallery variants, size pills, qty stepper capped, Comprar com Pix → existing Pix sheet + simulate)
- [ ] STO.11 RN: Meus pedidos with status chips + retirada note + pending cancel, pedido-pago success toast, Carteira histórico showing aluno order payments
- [ ] STO.12 Android: shared vitrine + detail + shell entries (same scope as STO.10)
- [ ] STO.13 Android: Meus pedidos + purchase feedback (same scope as STO.11)
- [ ] STO.14 iOS: shared vitrine + detail + shell entries (same scope as STO.10)
- [ ] STO.15 iOS: Meus pedidos + purchase feedback (same scope as STO.11)
