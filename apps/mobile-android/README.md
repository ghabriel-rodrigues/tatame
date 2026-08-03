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

## Auth slice (AUTH.21–23)

- **API client**: hand-written thin Retrofit 3 + OkHttp 5 + kotlinx.serialization
  client for the `/v1/auth` surface (`core/network`), DTO field names 1:1 with
  the committed contract `packages/shared/src/api/openapi.json`. The ticket-02
  committed-generated openapi-generator flow is **stubbed** (`./gradlew
  :app:generateApiClient` prints the rationale): the current contract defeats
  the `kotlin/jvm-retrofit2` + `kotlinx_serialization` generator (Any-typed
  `theme` map, dual 200/202 login response, boolean-enum `mfaRequired`).
  Revisit when the wider surface lands. `POST /auth/login/totp` is deliberately
  not implemented — platform 2FA accounts are directed to the web console.
- **Session**: refresh token AES/GCM-encrypted under an Android Keystore key
  inside Preferences DataStore (`core/auth`); access token memory-only;
  single-flight 401 refresh via OkHttp `Authenticator` (Mutex); problem+json →
  sealed `ApiError` on stable codes; session state machine in `SessionManager`
  (cold-start silent refresh behind the splash, membership chooser, logout,
  session-expired → login with message).
- **Role gate**: student/professor/guardian shells with placeholder bottom bar;
  admin + platform roles → "use o console web"; suspended academy → blocking
  screen; delinquent → read-only banner.
- Dev base URL (debug builds): `http://10.0.2.2:3000/` (cleartext allowed via
  the debug manifest overlay only).
- Known gap: offline cold start lands on login with an offline notice (stored
  session is kept) — the stale-shell offline entry of spec 001 needs a profile
  cache that arrives with a later slice.

## Design tokens (DS.8)

- `core/designsystem/tokens/LumiraTokens.kt` — **generated** by the
  design-system token pipeline (`packages/design-system`, `design-system:tokens`
  nx target) and committed here. Never hand-edit; re-copy on token changes.
- `core/designsystem/palette/DerivePalette.kt` — line-for-line Kotlin port of
  the canonical TS `derivePalette()` (OKLab white-label math);
  `PaletteRecipe.kt` embeds `tokens/palette-recipe.json` as generated data.
- `app/src/test/resources/palette-fixtures.json` — committed copy of the golden
  fixtures; `DerivePaletteTest` asserts the port reproduces every hex byte-equal.
