# Project setup: Xcode + SwiftUI

Type: grilling
Status: resolved

## Question

How is the iOS project scaffolded at `apps/mobile-ios` as an Xcode project **outside the nx build graph**? Decide: minimum iOS version (weigh SwiftUI API availability — e.g. NavigationStack needs 16+, Observation needs 17+, VisionKit DataScanner needs 16+ — against device coverage for gym users), Swift/Xcode version baseline, project generation approach (checked-in `.xcodeproj` vs XcodeGen/Tuist for merge-friendly project files), SPM for dependencies, target/module layout (single app target vs app + local SPM packages for design-system/networking/features), and — explicitly documented — how the Xcode world coexists with the nx/pnpm monorepo: git layout, `.gitignore`, what nx knows about it (nothing), and how CI invokes the build.

## Answer

Answered as BOSS from the charter (`agents/boss.md`).

### Decisions

1. **Minimum iOS version: 17.0.**
   - Unlocks the Observation framework (`@Observable`) — the foundation of the simple architecture ticket 06 is biased toward — plus mature `NavigationStack`, `ScrollView` APIs, and SwiftData should local persistence appear. Everything the handoff needs (custom glass tab bar, materials, springs) is comfortably 17-safe.
   - Device coverage: iOS 17 runs on iPhone XS (2018) and newer; in 2026 that is ~95%+ of active iPhones. Gym users are consumers on mainstream devices — no fleet of ancient managed hardware. The marginal coverage of iOS 16 does not pay for losing Observation and forcing `ObservableObject` boilerplate across every screen.
   - We do **not** chase iOS 26 Liquid Glass APIs: Lumira's purple-tinted glass is a custom material treatment anyway (map note), built on `.ultraThinMaterial` + tint overlays, which is iOS 15+.

2. **Swift 6 language mode, latest stable toolchain.** Swift 6.x / Xcode 16.x baseline (whatever is current stable when scaffolding lands), with **strict concurrency enabled from day one**. A greenfield app is the one place strict concurrency is cheap; retrofitting it is the expensive path. Toolchain version is pinned in `project.yml` (`SWIFT_VERSION`) and documented in `apps/mobile-ios/README.md`, not scattered.

3. **Project generation: XcodeGen** (over Tuist and over a checked-in `.xcodeproj`).
   - Raw `.xcodeproj` is rejected outright: pbxproj merge conflicts are the classic monorepo tax and the file is neither reviewable nor diffable — fails the declarative bias.
   - XcodeGen vs Tuist: both give a declarative, diffable manifest. **XcodeGen wins for this repo** because our modularity lives in local SPM packages (decision 4), so the Xcode project itself is a *thin app shell* — one app target, one test target. Tuist's payoffs (generated module graphs, binary caching, selective testing, its own DSL and tooling lifecycle) are aimed at projects whose module graph lives in the project manifest; ours doesn't. XcodeGen is a single `project.yml`, zero runtime footprint, trivially invoked (`rtk xcodegen generate`), and easy for any agent persona to read. Least machinery that satisfies the requirement.
   - Consequence: `Tatame.xcodeproj` is **gitignored and regenerated**; `project.yml` is the committed source of truth.

4. **Package structure: thin app target + local SPM packages** (charter bias confirmed).
   - `Tatame` app target: `@main` entry, root auth gate, persona-shell router, app icon/launch assets, Quicksand font registration. Nothing else.
   - Local packages under `apps/mobile-ios/Packages/`:
     - **DesignSystem** — generated Lumira tokens + theme engine (white-label 3-color derivation, dark theme), glass surfaces, pill tab bar, Lucide icon set, motion primitives (fadeUp/rise/pop springs). No feature code.
     - **TatameCore** — domain models, session state, Keychain access, RBAC role types shared by all features.
     - **TatameAPI** — HTTP client + DTOs talking to the NestJS backend (contents decided by ticket 02).
     - **Features** — one package, one library target per feature area (`AuthFeature`, `AlunoShell`, `ProfessorShell`, `ResponsavelShell`, then per-feature targets as parity slices arrive). One package with many targets avoids Package.swift sprawl while keeping compile-time boundaries.
   - Dependency direction (enforced by SPM): `Features → TatameAPI + TatameCore + DesignSystem`; `TatameAPI, DesignSystem → TatameCore` (at most); app target → `Features` only. Unit tests live as test targets inside each package (Swift Testing); only UI tests live at the app level.
   - Third-party dependencies via **SPM only**, declared in the package that needs them. No CocoaPods, no Carthage. Starting dependency count: zero — additions must be justified per ticket.

5. **SwiftUI-only.** No UIKit view controllers, no storyboards, no xibs. UIKit appears only behind `UIViewRepresentable`/`UIViewControllerRepresentable` where the platform forces it (camera/scanner surface if ticket 05 requires it, share sheets). Any exception beyond that is a decision, not a drift.

6. **Design tokens: generated Swift file** inside the DesignSystem package (e.g. `Packages/DesignSystem/Sources/DesignSystem/Generated/DesignTokens.swift`), produced by the design-system map's **token-pipeline ticket** (`.scratch/design-system/`) from the single Lumira source of truth, and **committed** — the out-of-graph Xcode build must never depend on an nx target having run. Regeneration is a manual/CI step in the pipeline's world that lands as a normal reviewed diff here. Full consumption contract (theme struct shape, runtime white-label derivation, belt tokens, fonts, glass mapping) is ticket 03's scope — this ticket fixes only the mechanism: *generated Swift file, committed, inside DesignSystem*.

7. **Coexistence with the nx/pnpm monorepo** — the iOS app is a guest in the repo, not a node in the graph:
   - **Git layout**: everything under `apps/mobile-ios/`. No `package.json`, so pnpm workspace globbing never picks it up; no `project.json` and it stays out of `nx.json` plugins/targets — **nx knows nothing about it**, by design.
   - **`.gitignore`**: `apps/mobile-ios/.gitignore` ignores `*.xcodeproj/`, `xcuserdata/`, `DerivedData/`, `.build/`, `.swiftpm/`. Root `.gitignore` untouched.
   - **Build entry point**: `apps/mobile-ios/README.md` documents the only two commands that matter: `rtk xcodegen generate` then `rtk xcodebuild -project Tatame.xcodeproj -scheme Tatame -destination 'platform=iOS Simulator,name=iPhone 16' build` (and `test`). Requires a macOS machine with Xcode — never runs inside the docker/nx pipeline.
   - **Root README**: gets a short "Mobile iOS (out of nx graph)" note under Getting started pointing at `apps/mobile-ios/README.md`, added when the scaffold lands (delivery-order rule: README boxes only check with working code).
   - **CI**: xcodebuild on a macOS runner, invoked separately from the nx pipeline — concrete enough now to graduate from fog: **ticket 08**.

8. **Persona model — same as RN: one app, role-selected shell.** One binary; after auth the user's role routes to one of **3 mobile persona shells: Aluno, Professor, Responsável** — the roles whose workflows are inherently on-the-mat/on-the-go (check-in, live roll call, guardian payments/confirmations). Admin da academia and Plataforma are dense back-office surfaces served web-first (React app). The handoff *does* contain Admin mobile designs; if Admin mobile is later pulled into scope, the shell architecture makes it an additive `AdminShell` target — record any gap as parity debt in the root README per charter rule 6, never silently. No per-persona builds, no separate bundle IDs: RBAC decides the shell at runtime, exactly like RN.

9. **Swift agent skills the dev persona must invoke** (from the priority table in `/Users/gupy/LLM_WIKI/wiki/tools/swift-agent-skills.md`):
   - Always during implementation: **swiftui-pro** (baseline review of all SwiftUI code), **swiftui-ui-patterns** (navigation/tab/screen composition), **swiftui-design-principles** (native polish), **swift-accessibility-skill** (always-on companion for any UI work), **swift-concurrency-pro** or **swift-concurrency-expert** (Swift 6 strict concurrency from day one), **swift-testing-pro** (Swift Testing suites in every package).
   - Situational: **swiftui-view-refactor** (as views grow), **swift-architecture-skill** (ticket 06), **swift-security-expert** (ticket 04 Keychain/session), **ios-simulator-skill / ios-debugger-agent** (build-run-verify loops), **swiftui-accessibility-auditor** (periodic audits), **swiftdata-pro** only if local persistence appears.

### Initial project structure

```
apps/mobile-ios/
├── project.yml                      # XcodeGen manifest — committed source of truth
├── .gitignore                       # *.xcodeproj/, xcuserdata/, DerivedData/, .build/, .swiftpm/
├── README.md                        # toolchain pin, xcodegen + xcodebuild commands, out-of-nx note
├── Tatame/                          # app target (thin shell)
│   ├── TatameApp.swift              # @main — auth gate → persona shell router
│   ├── Info.plist
│   ├── Assets.xcassets              # app icon + launch assets only (tokens live in DesignSystem)
│   └── Resources/                   # Quicksand font files
├── TatameUITests/                   # app-level UI tests (XCUITest); unit tests live in packages
└── Packages/
    ├── DesignSystem/
    │   ├── Package.swift
    │   ├── Sources/DesignSystem/
    │   │   ├── Generated/DesignTokens.swift   # from token pipeline — committed
    │   │   ├── Theme/                         # white-label derivation, dark theme
    │   │   ├── Components/                    # glass surfaces, pill tab bar, buttons…
    │   │   └── Icons/                         # Lucide set
    │   └── Tests/DesignSystemTests/
    ├── TatameCore/
    │   ├── Package.swift
    │   ├── Sources/TatameCore/                # models, session, Keychain, RBAC roles
    │   └── Tests/TatameCoreTests/
    ├── TatameAPI/
    │   ├── Package.swift
    │   ├── Sources/TatameAPI/                 # client + DTOs (ticket 02)
    │   └── Tests/TatameAPITests/
    └── Features/
        ├── Package.swift                      # one library target per feature area
        ├── Sources/AuthFeature/
        ├── Sources/AlunoShell/
        ├── Sources/ProfessorShell/
        ├── Sources/ResponsavelShell/
        └── Tests/…
```

### Implications for open tickets

- **Ticket 02 (networking)**: lives entirely in `Packages/TatameAPI`. iOS 17 floor means fully modern async/await URLSession — Alamofire has to justify itself against that, not against legacy callbacks. The SPM package layout makes apple/swift-openapi-generator's build plugin a first-class option (plugin attaches to the package target), and URLProtocol-stubbed unit tests run as plain package tests without booting the app.
- **Ticket 06 (architecture)**: iOS 17 Observation is now guaranteed, so plain SwiftUI **MV with `@Observable` models is the natural default** to evaluate first; TCA would be the only third-party dependency in an otherwise zero-dep graph and must clear that bar. Navigation state is modeled per persona-shell target (tab + stacked details + sheets), which the Features package layout already isolates.
- **Ticket 03 (tokens)**: mechanism fixed here (committed generated Swift file in DesignSystem); ticket 03 decides only the contract's shape and runtime theming.
- **Ticket 07 (testing)**: package-level Swift Testing is the structural default set here; ticket 07 decides scope/coverage strategy on top.

### Fog graduated

- CI for the iOS build was "Not yet specified"; the setup decision makes it concrete (xcodegen + xcodebuild on a macOS runner, outside the nx pipeline) → graduated to **ticket 08** (`issues/08-ci-ios-build.md`).
