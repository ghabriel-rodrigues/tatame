# Expo setup under the nx monorepo

Type: research
Status: resolved

## Question

How should the Expo app be created and wired inside the nx + pnpm monorepo at `apps/mobile-rn`? Compare `@nx/expo` (generator, executors, graph integration, maintenance status) vs a standalone Expo app registered as a plain pnpm workspace package. Cover the known pnpm quirks with Expo/React Native (hoisting, `node_modules` layout, `node-linker` settings, Metro resolution of workspace packages and symlinks), which Expo SDK version to pin, prebuild/CNG vs bare workflow, and how Metro must be configured to resolve the shared design-system package. Recommend one setup and document the exact scaffold steps.

## Answer

**Decision: plain Expo app (`create-expo-app`) at `apps/mobile-rn`, registered as a pnpm workspace package, wrapped for nx via inferred `package.json` script targets. Do NOT use `@nx/expo`. Pin Expo SDK 57. CNG/prebuild workflow (no bare, no committed `ios/`/`android/`).**

### Why not `@nx/expo`

- **Maintenance lag is structural**: as of 2026-08, `@nx/expo` supports at most Expo SDK 56 while SDK 57 (RN 0.86) shipped 2026-06-30 — an open request (nrwl/nx#36443) with no supported upgrade path. The plugin has repeatedly trailed Expo's release cadence.
- `@nx/expo` wraps Expo CLI behind executors, which is exactly the layer that breaks `expo-doctor`, `expo install --fix`, EAS CLI expectations, and Expo's upgrade tooling. BOSS bias applies: Expo-tooling health beats nx-graph purity.
- We lose almost nothing: nx 23 infers targets from `package.json` scripts, and the nx graph still sees `apps/mobile-rn → packages/design-system` through the `workspace:*` dependency. No `project.json` needed; add one with `run-commands` only if we later want cacheable custom targets.

### Expo SDK + workflow

- **SDK 57** (RN 0.86, New Architecture): current stable, >1 month old, and the version `create-expo-app` scaffolds today. Pinning 54/56 would only buy an upgrade chore later; our native-adjacent deps (`expo-blur`, `expo-secure-store`, `lucide-react-native`, Reanimated) are SDK-tracked or pure-JS.
- **CNG (prebuild)**: never commit `ios/`/`android/`; native config lives in `app.json`/config plugins. Custom native modules are not foreseen; dev-client + EAS Build cover everything. Bare workflow rejected — it forfeits upgrade tooling and config-plugin automation.

### pnpm + Metro in the monorepo

- **Keep pnpm's default isolated `node-linker`** (repo has no `.npmrc` override today — leave it that way). Expo supports isolated installs first-class since SDK 54. Documented fallback if a native build/resolution error ever appears: set `nodeLinker: hoisted` in `pnpm-workspace.yaml` (root-level switch, one line), reinstall, `expo start --clear`.
- **No manual Metro monorepo config**: since SDK 52, `expo/metro-config` auto-detects the workspace root and configures `watchFolders`/`nodeModulesPaths`. `metro.config.js` stays minimal:
  ```js
  const { getDefaultConfig } = require('expo/metro-config');
  module.exports = getDefaultConfig(__dirname);
  ```
- **Design-system package resolution**: consume `@tatame/design-system` as `workspace:*`; its `package.json` must point `main`/`exports` at **TS source** (`src/index.ts`) — Metro transpiles workspace source via `babel-preset-expo`, no build step, hot reload across the package boundary. (RN-side consumption contract detail belongs to ticket 03.)
- **EAS**: builds from repo root work with pnpm workspaces out of the box (EAS detects root `pnpm-lock.yaml`); run `eas` commands from `apps/mobile-rn`. Pipeline specifics were fog — now graduatable since SDK/workflow are fixed (see ticket 08).

### Scaffold steps

```bash
cd /Users/gupy/apps/tatame
rtk pnpm create expo-app apps/mobile-rn --template default   # SDK 57
# rename package to @tatame/mobile-rn; delete any nested lockfile
rtk pnpm install                                              # root install, workspace-aware
# metro.config.js as above (create-expo-app default already matches)
cd apps/mobile-rn && rtk npx expo-doctor                      # must pass clean
rtk npx nx show project @tatame/mobile-rn                     # verify inferred targets (start/android/ios)
```

Acceptance: `expo-doctor` clean, `nx graph` shows the app node, `expo start` boots from the workspace.

Sources: Expo monorepo guide (docs.expo.dev/guides/monorepos), nrwl/nx issue #36443.
