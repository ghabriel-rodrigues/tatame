# Tatame iOS (out of the nx graph)

Native SwiftUI app for the Aluno / Professor / Responsavel personas.
This directory is a guest in the monorepo: **no `package.json`, no
`project.json`** — pnpm and nx must never see it (ticket 01, decision 7).
It builds only on a macOS machine with Xcode.

## Toolchain

- iOS deployment target: **17.0**
- Swift language mode: **6** (strict concurrency), pinned in `project.yml`
- Xcode: 26.x (validated with 26.4.1 / Swift 6.3)
- Project generation: **XcodeGen** (`rtk brew install xcodegen`) —
  `project.yml` is the committed source of truth; `Tatame.xcodeproj` is
  gitignored and regenerated.

## Build

```sh
cd apps/mobile-ios
rtk xcodegen generate
rtk xcodebuild -project Tatame.xcodeproj -scheme Tatame \
  -destination 'generic/platform=iOS Simulator' \
  -skipPackagePluginValidation build
```

To run in a simulator use a concrete destination, e.g.
`-destination 'platform=iOS Simulator,name=iPhone 16'`.

`-skipPackagePluginValidation` is required (CI and first local build alike)
because `TatameAPI` runs the `swift-openapi-generator` **build plugin**; in
Xcode you can instead click "Trust & Enable" once. Plain `swift build`/`swift
test` need no flag.

## Test

Unit tests live inside the local SPM packages (Swift Testing) and run
SPM-level on the mac host — fast, no simulator boot:

```sh
cd apps/mobile-ios/Packages/DesignSystem && rtk swift test
cd apps/mobile-ios/Packages/TatameCore && rtk swift test
cd apps/mobile-ios/Packages/TatameAPI && rtk swift test
cd apps/mobile-ios/Packages/Features && rtk swift test
```

## Layout

- `Tatame/` — thin app target: `@main` + composition root (Keychain store,
  generated-client stack, `SessionStore`) rendering `RootView` (AppShell).
  Dev server URL is `http://localhost:3000` (env-specific `.xcconfig` wiring
  is ticket 08 territory).
- `Packages/DesignSystem` — committed generated `LumiraTokens.swift`,
  `DerivePalette.swift` (Swift port of the canonical TS executor, recipe
  embedded as `Generated/PaletteRecipe.swift`), `TatameTheme` environment
  scaffold, golden-fixture tests against `palette-fixtures.json`.
- `Packages/TatameCore` — domain models + seams for the auth slice:
  `ApiError` (stable problem+json codes), `AuthRepository` protocol,
  `RefreshTokenStore`/`AccessTokenStore` seams with the Keychain
  implementation (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`),
  `SessionStore` (@MainActor @Observable state machine), `AppRoute` role
  gate.
- `Packages/TatameAPI` — swift-openapi-generator **build plugin** over the
  committed spec copy (`Sources/TatameAPI/openapi.json` +
  `openapi-generator-config.yaml`, tag-filtered to `auth`/`public`);
  generated code stays in the build dir. Exposes `TatameClientFactory`
  (URLSession transport + `AuthMiddleware` bearer/retry-once +
  `TokenRefreshCoordinator` single-flight actor) returning the
  `AuthRepository` implementation.
- `Packages/Features` — `AuthFeature` (splash, login, membership chooser per
  handoff aluno-01/02) and `AppShell` (`RootView` auth gate + persona shell
  placeholders, web-console and suspended blocking screens, read-only
  banner).

## Generated-file sync (committed-copy convention)

The Xcode build never depends on an nx target having run. Refresh as a
normal reviewed diff after running the `design-system:tokens` target:

```sh
rtk cp packages/design-system/build/swift/LumiraTokens.swift \
  apps/mobile-ios/Packages/DesignSystem/Sources/DesignSystem/Generated/LumiraTokens.swift
rtk cp packages/design-system/tokens/palette-fixtures.json \
  apps/mobile-ios/Packages/DesignSystem/Tests/DesignSystemTests/Resources/palette-fixtures.json
```

`Generated/PaletteRecipe.swift` mirrors `tokens/palette-recipe.json`; update
it in the same diff on any intentional recipe change (the golden-fixture
tests pin all three against the canonical TS executor).

The API spec copy follows the same convention — refresh it whenever the
backend contract changes:

```sh
rtk sh apps/mobile-ios/scripts/sync-openapi.sh
# equivalent to:
# rtk cp packages/shared/src/api/openapi.json \
#   apps/mobile-ios/Packages/TatameAPI/Sources/TatameAPI/openapi.json
```
