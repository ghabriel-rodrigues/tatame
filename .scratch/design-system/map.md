# Wayfinder map: design-system

Label: wayfinder:map

## Destination

A locked architecture for `packages/design-system` — the single package consumed by ALL clients (web React+MUI, React Native/Expo, and token export for Kotlin/Android and Swift/iOS) — with the Lumira tokens as source of truth, white-label palette derivation, belt tokens, dark theme, and a named component inventory. Done when nothing is left to decide before someone builds the package.

## Notes

- Domain: Tatame (jiu-jitsu academy SaaS). Business rules and fixed stack decisions live in `agents/boss.md` — do NOT relitigate fixed decisions (nx+pnpm monorepo; web = React + MUI skinned by Lumira; mobile = RN/Expo + Kotlin + Swift in parallel; single design-system package).
- This effort runs AFK: grilling tickets are answered by the BOSS charter (`agents/boss.md`); anything genuinely undecidable escalates to the human.
- Token source of truth: `/Users/gupy/Desktop/design_handoff_jiujitsu_app/_ds/lumira-design-system-019dfa0a-526c-7d95-84a4-34e8a4fff190/colors_and_type.css`.
- Design reference: `/Users/gupy/Desktop/design_handoff_jiujitsu_app/README.md` (Design Tokens, Interactions & Behavior, Assets sections) + 79 screenshots in `screenshots/` + 6 `.dc.html` prototypes (see `applyPalette()` / `applyTema()` in each file).
- LLM wiki skills to consult: `/Users/gupy/LLM_WIKI/raw/skills/react/`, `/Users/gupy/LLM_WIKI/raw/skills/shadcn/`, `/Users/gupy/LLM_WIKI/raw/skills/expo/` (also `kotlin/` and `swift/` for native token consumption).
- Known fact: tokens `--purple-ink` / `--pink-ink` are referenced by the prototypes but only exist at runtime (injected by prototype JS) — they are NOT in `colors_and_type.css`. The token layer must define them explicitly.
- Known fact: belt colors are hardcoded hex in the prototypes (azul `#1E5CB3`, cinza `#9A9AA2`, amarela `#E8C93D`, ponteira `#17141F`). BOSS review checklist forbids hardcoded colors — belts must become first-class tokens (see belt tokenization ticket).
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- Token pipeline: single DTCG `tokens.json` + `palette-recipe.json` in `packages/design-system/tokens/`, style-dictionary v4 builds CSS+TS (web), TS (RN), Compose object (Android), Swift enum (iOS); CSS file converted once then frozen; `--purple-ink`/`--pink-ink` and belt hexes promoted to first-class tokens; white-label derivation ships as per-platform `derivePalette()` code (color-mix on web, OKLab math elsewhere) driven by the shared recipe JSON; motion = ms numbers + bezier tuples — `issues/01-token-pipeline.md`
- Component inventory: tokens shared, components per-platform (MUI wrap / RN / Compose / SwiftUI) driven by shared anatomy specs in `packages/design-system/docs/components/`; PascalCase no prefix except `TatameButton`; identical variant/size/prop vocabulary everywhere; admission rule = 2+ personas or auth path; P0 auth (TatameButton, FormField, Card, Toast, BrandLogo, ScreenHeader), P1 shell (GlassTabBar, BottomSheet, ListRow, Avatar, Chip, SegmentedControl, StatTile, Badge, IconButton, Switch, ProgressBar, BeltBar, InlineAlert, EmptyState), P2 feature (CalendarMonth, QRPanel, Timeline, MiniBarChart, Stepper, QuantityStepper, PlanCard, ProductCard, SuccessBurst, PaletteSwatch) — `issues/05-component-inventory-naming.md`
- MUI theming: runtime factory `createTatameTheme(derivedPalette, mode)` in `packages/design-system/src/theme/`, authored mapping over generated tokens; MUI v6 `cssVariables: true` + colorSchemes so brand/dark swaps are CSS-var flips (no re-render storms); MUI variants remapped to product type scale (h1 = 25/700/-0.02em screen title, body 13–14, overline = eyebrow); `shape.borderRadius: 14` + per-component overrides (Card 20, sheets 28 top, Button/Chip pill 999); 25-slot shadow array plateau-mapped to the 5 purple-tinted token levels, glow as CTA-only mixin; glass = `glassSurface('regular'|'deep')` mixin (blur 20/24, new `glass.blur-strong` token), never glass-on-glass; Quicksand via @fontsource — `issues/02-mui-theming-strategy.md`
- White-label runtime: ONE canonical `derivePalette(brand, mode)` — pure dependency-free TS OKLab implementation executing `palette-recipe.json`; web also uses it (drops prototype CSS color-mix path — supersedes 01's "color-mix on web" note); Kotlin/Swift ports pinned byte-equal by shared golden fixtures (`palette-fixtures.json`, 4 ready-made palettes × 2 modes) in CI; web `applyBrand()` writes resolved hex onto Lumira CSS vars + same object feeds `createTatameTheme`; tenant branding = 3 colors + logoUrl from academy bootstrap payload, cached locally, default Tatame purple fallback; Plataforma persona never white-labeled; derivation client-side (server-side rejected); dark = static `applyTema()` token set then derivePalette('dark') overlay — unblocks 06 with color math closed — `issues/03-white-label-palette-derivation.md`
- Belt tokens: static brand-independent `color.belt.*` (white #EDEAE2, gray #9A9AA2, yellow #E8C93D, orange #E8833D, green #3D8B4F, blue #1E5CB3, purple #6B2DBA, brown #6B4A2D, black #17141F, red #B3261E + structural tip/stripe/outline) — exempt from white-label derivation and dark remix; DB owns ladders as `BeltDef` rows (slug, colorSlug, tipColorSlug, maxDegrees, kids), design-system ships `BELT_COLORS` map + BeltBar anatomy spec (bar radius-xs + ponteira ~22% + white degree stripes max 4, black belt = red tip w/ dan stripes, sizes sm/md/lg); components render `BeltDef`, never switch on names; kids split-color variants deferred (forward-compat `secondaryColorSlug`); BrandLogo reuses the anatomy — `issues/04-belt-color-tokenization.md`

## Not yet specified

- Package build/publish mechanics inside nx (tsup/vite lib mode, exports map, versioning between web and RN entry points) — sharpens after the token pipeline and MUI decisions land.

(Graduated to tickets after 01+05 resolved: icon strategy → `issues/07-icon-strategy.md`; component showcase → `issues/08-component-showcase.md`; asset handling → `issues/09-asset-handling.md`.)

## Out of scope

- Chat/comunicados UI, multiunidades, non-BJJ martial arts UI — per handoff design backlog, not designed yet.
- Building the actual package/components — this map locks the architecture; execution is a separate effort.
- Backend, app-level routing, and screen implementations for any persona.

- Extend `design-system:tokens` build to also emit `PaletteRecipe.swift` and the Kotlin recipe-data file so native recipe mirrors regenerate with the pipeline instead of being hand-synced (golden fixtures pin them meanwhile; surfaced by DS.9).

- Kotlin token emission fixes (surfaced by DS.8): emit package `br.com.tatame.core.designsystem.tokens` instead of `com.tatame.designsystem.tokens`; canonical sync path is `core/designsystem/tokens/`; also emit the Kotlin recipe-data file (see Swift note above) and add fixture-copy freshness checks for both native projects.
