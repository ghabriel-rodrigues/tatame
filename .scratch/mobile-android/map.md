# Wayfinder map: Kotlin Android app architecture

Label: wayfinder:map

## Destination

A locked native Kotlin Android app architecture for Tatame — Gradle project layout inside the monorepo, Compose + Material3 skinned with Lumira tokens, networking/API client, auth/session storage, QR scanning, DI, and testing strategy decided — ready to mirror features after the RN app ships them.

## Notes

- Domain: mobile-first SaaS for jiu-jitsu academy management. Business rules and personas live in `agents/boss.md`; UI/UX source of truth is the design handoff (`/Users/gupy/Desktop/design_handoff_jiujitsu_app/README.md` — especially "Interactions & Behavior" and "Assets").
- **This project runs wayfinder AFK**: grilling tickets are answered by the BOSS charter (`agents/boss.md`); only genuinely undecidable questions escalate to the human.
- Fixed decisions (do not relitigate): native Kotlin Android app is one of 3 parallel mobile implementations; feature delivery order is **DB → backend → web → mobiles, RN first among the mobiles** — this app mirrors the RN app's shipped feature slices for parity, and parity debt is recorded in the root README.
- The Android app is a **Gradle project under `apps/mobile-android`, NOT managed by the nx build graph** — nx/pnpm never see it; the setup ticket documents how the two build worlds coexist (git layout, `.gitignore`, CI invocation, how it consumes design-system token exports as generated artifacts).
- **JetBrains kotlin-agent-skills that apply** (catalog: `/Users/gupy/LLM_WIKI/wiki/tools/kotlin-agent-skills.md`, sources: `/Users/gupy/LLM_WIKI/raw/skills/kotlin/skills/`):
  - `kotlin-tooling-agp9-migration` — consult its "Pure Android Tips" *before* pinning AGP/Kotlin/Gradle versions for the new project (AGP 9 built-in Kotlin, removal of `org.jetbrains.kotlin.android`, kapt → KSP).
  - `kotlin-tooling-immutable-collections-0-5-x-migration` — if `kotlinx.collections.immutable` is adopted for `@Stable` Compose state, use the 0.5.x participial names (`adding`, `putting`, …) from day one.
  - Not applicable: JPA entity mapping (backend is NestJS), CocoaPods/SPM and native-build-performance (KMP/iOS only); `kotlin-tooling-java-to-kotlin` only if porting Java sample code.
- Design constraints to honor: glass/blur surfaces (Compose blur/haze techniques), custom floating pill tab bar with gradient center FAB (not stock `NavigationBar`), Quicksand type, pill radii, purple-tinted shadows, Lucide icons, handoff motion spec (fadeUp/rise/pop, 120/200/320ms, spring).
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- Push notifications (FCM setup, token registration, per-persona routing) — depends on backend notification design.
- Deep links / App Links for the invite flow (7-day invite links opening stepped signup) — depends on how the public invite web flow and the app hand off.
- Store purchase flows in-app (Pix/boleto/card sheets, Stripe surface on Android) — depends on backend billing design and Stripe sandbox wiring.
- Dark theme + white-label runtime theming mechanics (3-color palette → derived scale at runtime in Compose) — hangs on the design tokens consumption decision and the design-system map's token pipeline.
- CI for the Android build (where Gradle runs relative to the nx-driven pipeline) — sharpens after the project-setup decision.

## Out of scope

- Chat/comunicados — handoff design backlog, not designed.
- Multi-unit academies — handoff design backlog.
- Real geolocation check-in verification in v1 — handoff design backlog; v1 ships QR/code/manual methods only.
