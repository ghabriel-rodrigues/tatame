# Wayfinder map: Swift iOS app architecture

Label: wayfinder:map

## Destination

A locked native Swift iOS app architecture for Tatame — Xcode project layout inside the monorepo, SwiftUI stack and minimum iOS version, networking, design-token consumption, auth/session via Keychain, QR scanning, architecture pattern, and testing strategy decided — ready to mirror features after the RN app ships them.

## Notes

- Domain: mobile-first SaaS for jiu-jitsu academy management. Business rules and personas live in `agents/boss.md`; UI/UX source of truth is the design handoff (`/Users/gupy/Desktop/design_handoff_jiujitsu_app/README.md` — especially "Interactions & Behavior" and "Assets").
- **This project runs wayfinder AFK**: grilling tickets are answered by the BOSS charter (`agents/boss.md`); only genuinely undecidable questions escalate to the human.
- Fixed decisions (do not relitigate): native Swift iOS app is one of 3 parallel mobile implementations; feature delivery order is **DB → backend → web → mobiles, RN first among the mobiles** — this app mirrors the RN app's shipped feature slices for parity, and parity debt is recorded in the root README.
- The iOS app is an **Xcode project under `apps/mobile-ios`, outside the nx build graph** — nx/pnpm never see it; the setup ticket documents how the two build worlds coexist.
- **Swift agent skills**: the wiki page `/Users/gupy/LLM_WIKI/wiki/tools/swift-agent-skills.md` now exists (written 2026-08-02) with a Tatame-specific priority table — use it as the catalog; raw ingested skills live at `/Users/gupy/LLM_WIKI/raw/skills/swift/skills/`. Ticket 01's answer fixes the dev-persona roster (swiftui-pro, swiftui-ui-patterns, swiftui-design-principles, swift-accessibility-skill, swift-concurrency-pro/expert, swift-testing-pro + situational ones).
- Design constraints to honor: glass surfaces map naturally to iOS materials (`.ultraThinMaterial` etc.) but must match Lumira's purple-tinted glass; custom floating pill tab bar with gradient center FAB (not stock `TabView` chrome); Quicksand type; pill radii; Lucide icons (not SF Symbols — visual parity with the handoff); motion spec (fadeUp/rise/pop, 120/200/320ms, spring).
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- **01 project setup**: iOS 17 min (Observation), Swift 6 strict concurrency, XcodeGen (`project.yml` committed, `.xcodeproj` gitignored), thin app target + local SPM packages (DesignSystem/TatameCore/TatameAPI/Features), SwiftUI-only, committed generated `DesignTokens.swift`, `apps/mobile-ios` invisible to nx/pnpm (own `.gitignore` + README, xcodebuild entry), one app with 3 role-selected shells (Aluno/Professor/Responsável; Admin/Plataforma web-first), dev skills roster from the wiki priority table; CI fog graduated to ticket 08 → `issues/01-project-setup-xcode-swiftui.md`

## Not yet specified

- Push notifications (APNs setup, token registration, per-persona routing) — depends on backend notification design.
- Deep links / universal links for the invite flow (7-day invite links opening stepped signup) — depends on how the public invite web flow and the app hand off.
- Store purchase flows in-app (Pix/boleto/card sheets, Stripe surface on iOS; Apple's rules for physical-goods payments) — depends on backend billing design and Stripe sandbox wiring.
- Dark theme + white-label runtime theming (3-color palette → derived scale at runtime in SwiftUI) — hangs on the design tokens consumption decision and the design-system map's token pipeline.
- ~~CI for the iOS build~~ — graduated to ticket 08 (`issues/08-ci-ios-build.md`) after the project-setup decision.

## Out of scope

- Chat/comunicados — handoff design backlog, not designed.
- Multi-unit academies — handoff design backlog.
- Real geolocation check-in verification in v1 — handoff design backlog; v1 ships QR/code/manual methods only.
