# Project setup: Gradle + Compose + Material3

Type: grilling
Status: resolved

## Question

How is the Android project scaffolded at `apps/mobile-android` as a standalone Gradle project **outside the nx build graph**? Decide: AGP/Kotlin/Gradle versions (consult `kotlin-tooling-agp9-migration` "Pure Android Tips" first — built-in Kotlin, KSP over kapt), min/target SDK, Gradle module layout (single `:app` vs `:app` + feature/core modules), Compose + Material3 as the UI stack with Material3 theming skinned by Lumira tokens (what maps to `ColorScheme`/`Typography`/`Shapes` and what needs custom design-system composables), version catalog conventions, and — explicitly documented — how this Gradle world coexists with the nx/pnpm monorepo: git layout, `.gitignore`, what (if anything) nx knows about it, and how CI invokes the Gradle build.

## Answer

Answered as BOSS per charter (`agents/boss.md`) and the AGP 9 skill (`kotlin-tooling-agp9-migration`, "Pure Android Tips" + VERSION-MATRIX).

### Toolchain versions (pinned)

| Component | Version | Rationale |
|---|---|---|
| AGP | **9.0.1** | Skill matrix "Recommended" (9.0.0 + early bug fixes). Built-in Kotlin — do NOT apply `org.jetbrains.kotlin.android` anywhere (module, root, or catalog); it conflicts. |
| Gradle (wrapper) | **9.1** | Hard floor for AGP 9. `distributionUrl=.../gradle-9.1-bin.zip`. |
| Kotlin (KGP) | **2.3.20** | Matrix-recommended 2.3.x line; Compose compiler via `org.jetbrains.kotlin.plugin.compose` is version-locked to KGP automatically. |
| JDK | **17** (toolchain) | AGP 9 minimum. AGP 9 changed the Java default from 8 to 11 — we set `compileOptions` + `jvmTarget` explicitly to 17; no reliance on defaults. |
| KSP | **2.3.6** | Matrix-recommended; decoupled from the Kotlin compiler version since 2.3.0. kapt is banned (AGP 9 incompatible) — anything needing codegen goes through KSP. |
| SDK Build Tools | 36.0.0 | Required by AGP 9. |
| compileSdk / targetSdk | **36 / 36** | Latest. `targetSdk` set explicitly (AGP 9 flips `android.sdk.defaultTargetSdkToCompileSdkIfUnset`; we don't lean on it). |
| minSdk | **26** | BOSS bias confirmed: Android 8.0 covers the practical academy-owner device base in BR, gives us java.time, adaptive icons, and notification channels natively, and avoids multidex/desugaring drag. No business case for < 26. |
| Compose | **Jetpack Compose BOM (latest stable) + Material3** | Pure Android app — androidx BOM, not Compose Multiplatform. Compiler plugin: `org.jetbrains.kotlin.plugin.compose` (tied to Kotlin 2.3.20). |
| kotlinx-collections-immutable | **0.5.x** | For `@Stable`/`@Immutable` Compose state. Per the ingested skill, use the KEEP-0459 participial names (`adding`, `putting`, `removingAt`, `cleared`, ...) from day one — never the pre-0.5 names. |

AGP 9 hygiene (from "Pure Android Tips"): new DSL interfaces only (`CommonExtension`; `BaseExtension` is gone), `kotlin { compilerOptions {} }` instead of `android.kotlinOptions`, R class is compile-time non-final in app modules (no `switch` on R fields), and we start with a clean `gradle.properties` so none of the flipped AGP 9 defaults need overrides.

### Module layout: single `:app`, package-by-feature

BOSS decision: **single `:app` module**. Rationale: this app mirrors RN feature slices with parity debt tracked in the README — the bottleneck is spec parity, not build parallelism. Multi-module Gradle buys incremental-build isolation we don't need at this size and taxes every feature with module wiring. We keep the *package* structure module-shaped so a later split (`:core:designsystem`, `:core:network`, `:feature:*`) is mechanical, not archaeological.

**One app, 3 mobile personas by role** (same model as RN): Aluno, Professor, Responsável ship in a single APK; post-login role from the auth payload routes to the persona nav graph. RBAC is enforced server-side; the client only gates surfaces. Admin/Plataforma stay web-first.

### Initial project structure

```
apps/mobile-android/                  # standalone Gradle project — nx/pnpm never see it
├── gradle/
│   ├── wrapper/                      # own wrapper, Gradle 9.1
│   └── libs.versions.toml            # single version catalog, sole source of dep versions
├── gradlew / gradlew.bat
├── settings.gradle.kts               # rootProject "tatame-android"; include(":app")
├── build.gradle.kts                  # plugin aliases apply false only
├── gradle.properties                 # AndroidX on, no AGP 9 default overrides
├── .gitignore                        # .gradle/ build/ local.properties .kotlin/ captures/
└── app/
    ├── build.gradle.kts              # com.android.application + kotlin.plugin.compose (no kotlin-android!)
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── kotlin/br/com/tatame/
        │   │   ├── TatameApplication.kt
        │   │   ├── MainActivity.kt           # single-activity, edge-to-edge
        │   │   ├── core/
        │   │   │   ├── designsystem/         # TatameTheme + custom components
        │   │   │   │   ├── theme/            # Theme.kt, Color.kt, Type.kt, Shape.kt
        │   │   │   │   │   └── generated/    # LumiraTokens.kt — GENERATED, do not edit
        │   │   │   │   └── component/        # TatameTabBar, GlassSurface, BeltChip, ...
        │   │   │   ├── network/              # reserved — ticket 02
        │   │   │   ├── auth/                 # reserved — ticket 04
        │   │   │   └── navigation/           # root nav host + persona graphs
        │   │   └── feature/                  # package-by-feature, one pkg per spec slice
        │   │       ├── login/
        │   │       ├── checkin/
        │   │       ├── agenda/
        │   │       └── ...                   # added as RN ships slices
        │   └── res/
        │       ├── font/                     # Quicksand (variable or static weights)
        │       └── values/                   # splash/launch theming only — NO app colors in XML
        ├── test/                             # JVM unit tests
        └── androidTest/                      # instrumented (classic layout — src renames are KMP-only)
```

### Theming: Material3 skinned by Lumira

- `TatameTheme` wraps `MaterialTheme` and maps Lumira tokens → `ColorScheme` (light + dark), `Typography` (Quicksand families/scale), `Shapes` (pill radii family).
- What Material3 cannot express — glass/blur surfaces, gradient center-FAB pill tab bar (custom composable, not stock `NavigationBar`), purple-tinted shadows, belt colors, motion spec (fadeUp/rise/pop 120/200/320ms, spring) — lives in `core/designsystem` as custom composables plus a `TatameExtendedColors`/`TatameMotion` set exposed via `CompositionLocal`s alongside `MaterialTheme`.
- Token source: `core/designsystem/theme/generated/LumiraTokens.kt` is a **Kotlin object emitted by the design-system token pipeline** (cross-map dependency — consumption mechanics, regeneration trigger, and white-label 3-color runtime derivation are ticket 03 + the design-system map; this ticket only fixes the landing path and the "generated, never hand-edited, committed" rule).
- Hard rule (BOSS review checklist #4): zero hardcoded colors in composables or XML — belts included.

### Coexistence with the nx monorepo

- **Git**: lives in the same repo at `apps/mobile-android`. Own `.gitignore` (`.gradle/`, `build/`, `local.properties`, `.kotlin/`). Wrapper jar is committed (standard Gradle practice).
- **nx/pnpm**: know nothing about it. No `project.json`, not in `pnpm-workspace.yaml`, excluded from nx defaults if it ever globs there. An nx `run-commands` wrapper (`nx run mobile-android:build` shelling to `./gradlew`) is **optional, deferred** until someone actually wants unified task running.
- **Root README**: gets a "Building the Android app" note — `cd apps/mobile-android && ./gradlew :app:assembleDebug` (tests: `./gradlew :app:test`), requires JDK 17 + Android SDK 36; no pnpm/nx involvement.
- **CI**: separate workflow/job — checkout, setup JDK 17, gradle action with caching, run `./gradlew :app:build` from `apps/mobile-android`, path-filtered on `apps/mobile-android/**`. Independent of the nx affected graph. (This also resolves the "CI for the Android build" fog line on the map.)
- **Token artifact**: the generated `LumiraTokens.kt` is produced by the nx-side token pipeline and committed into the Gradle tree — the only sanctioned crossing between the two build worlds.

### Implications for downstream tickets

- **Ticket 02 (networking)**: toolchain is KSP-ready and kapt-free; `kotlinx.serialization` plugin available at KGP 2.3.20 (serialization runtime 1.8.0+ per matrix); minSdk 26 removes any legacy-TLS/desugaring constraint on Retrofit/OkHttp vs Ktor. Single-module layout means the client lands in `core/network` as a package; codegen output (if OpenAPI codegen wins) needs a committed-generated convention mirroring `LumiraTokens.kt`.
- **Ticket 06 (DI)**: kapt is off the table — **Hilt is only admissible via KSP**, and its KSP-processor compatibility with Kotlin 2.3.20 / KSP 2.3.6 / AGP 9 must be verified as the first check of that ticket; Koin (no codegen) carries zero toolchain risk. Single `:app` module removes Hilt's multi-module aggregation advantage for now — weigh accordingly.
