# White-label runtime palette derivation

Type: grilling
Status: open
Blocked by: 01

## Question

How do we port the prototypes' `applyPalette()` — which derives the entire app palette from 3 academy colors `[deep, vibrant, accent]` via `color-mix(in oklab, ...)` — into the design system? Decide: runtime derivation (CSS `color-mix` on web is native; RN/Kotlin/Swift have no `color-mix` — need an oklab mixing implementation in TS/Kotlin/Swift or a shared derivation spec) vs build-time/server-side derivation (backend computes and serves the full derived scale per tenant, all clients just consume resolved colors); where the derivation algorithm lives so all 4 clients produce identical colors; how derived palettes interact with the semantic token layer and the ready-made palettes (default purple, navy/red, green/gold, black/gold); and how the runtime-only `--purple-ink`/`--pink-ink` tokens fit the derivation.
