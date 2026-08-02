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

## Not yet specified

- Motion/animation token delivery for natives — `rise`/`fadeUp`/`pop`, ease-out/spring curves, 120/200/320ms durations exist as CSS vars; how they translate to Reanimated, Compose, and SwiftUI hangs on the token pipeline decision.
- Icon strategy across platforms — Lucide (stroke 2px, rounded) on web/RN is clear; Kotlin/Swift equivalents and whether the design-system package ships icon mappings hangs on pipeline + inventory decisions.
- Package build/publish mechanics inside nx (tsup/vite lib mode, exports map, versioning between web and RN entry points) — sharpens after the token pipeline and MUI decisions land.
- Component showcase/documentation (Storybook or similar) — whether and where; hangs on component inventory.
- Asset handling (Tatame logo placeholder drawn in CSS, QR code lib, avatar-initials gradients) — sharpens after component inventory.

## Out of scope

- Chat/comunicados UI, multiunidades, non-BJJ martial arts UI — per handoff design backlog, not designed yet.
- Building the actual package/components — this map locks the architecture; execution is a separate effort.
- Backend, app-level routing, and screen implementations for any persona.
