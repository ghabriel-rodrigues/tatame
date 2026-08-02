# Tatame — Android (Kotlin + Jetpack Compose)

Standalone Gradle project, **outside** the nx/pnpm build graph (see
`.scratch/mobile-android/issues/01`). nx and pnpm never see this directory —
no `package.json`/`project.json` here, ever.

## Requirements

- JDK 17+ on PATH (the build provisions/targets a JDK 17 toolchain via foojay).
- Android SDK: platform 36, build-tools 36.0.0 (`sdk.dir` in `local.properties`,
  gitignored). Non-interactive install:

  ```sh
  brew install --cask android-commandlinetools
  yes | sdkmanager --sdk_root="$HOME/Library/Android/sdk" --licenses
  yes | sdkmanager --sdk_root="$HOME/Library/Android/sdk" \
    "platforms;android-36" "build-tools;36.0.0" "platform-tools"
  echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
  ```

## Build & test

```sh
./gradlew :app:testDebugUnitTest   # JVM unit tests (palette golden fixtures + Koin verify)
./gradlew :app:assembleDebug       # debug APK
```

## Toolchain (pinned — ticket 01)

AGP 9.0.1 (built-in Kotlin — `org.jetbrains.kotlin.android` is banned), Gradle 9.1,
Kotlin 2.3.20, JDK 17 toolchain, KSP only (kapt banned), compileSdk/targetSdk 36,
minSdk 26, single `:app` module, package-by-feature under `br.com.tatame`.
All dependency versions live in `gradle/libs.versions.toml`.

## Design tokens (DS.8)

- `core/designsystem/tokens/LumiraTokens.kt` — **generated** by the
  design-system token pipeline (`packages/design-system`, `design-system:tokens`
  nx target) and committed here. Never hand-edit; re-copy on token changes.
- `core/designsystem/palette/DerivePalette.kt` — line-for-line Kotlin port of
  the canonical TS `derivePalette()` (OKLab white-label math);
  `PaletteRecipe.kt` embeds `tokens/palette-recipe.json` as generated data.
- `app/src/test/resources/palette-fixtures.json` — committed copy of the golden
  fixtures; `DerivePaletteTest` asserts the port reproduces every hex byte-equal.
