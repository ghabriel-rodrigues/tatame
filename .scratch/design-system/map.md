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

## Not yet specified

- Package build/publish mechanics inside nx (tsup/vite lib mode, exports map, versioning between web and RN entry points) — sharpens after the token pipeline and MUI decisions land.

(Graduated to tickets after 01+05 resolved: icon strategy → `issues/07-icon-strategy.md`; component showcase → `issues/08-component-showcase.md`; asset handling → `issues/09-asset-handling.md`.)

## Out of scope

- Chat/comunicados UI, multiunidades, non-BJJ martial arts UI — per handoff design backlog, not designed yet.
- Building the actual package/components — this map locks the architecture; execution is a separate effort.
- Backend, app-level routing, and screen implementations for any persona.
