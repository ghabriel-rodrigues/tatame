# Design-system consumption in React Native

Type: grilling
Status: resolved
Blocked by: 01

## Question

How does the RN app consume the shared Lumira design-system package — token format (JS/TS theme object vs generated constants), theming runtime for white-label (3-color palette → derived scale, since CSS `color-mix(in oklab)` is unavailable in RN), and the component strategy for the handoff's signature surfaces: glass/blur (tab bar, sheets, toasts) via `expo-blur`, the custom floating pill tab bar with gradient center FAB, Quicksand font loading, pill radii, purple-tinted shadows, and the motion spec (fadeUp/rise/pop, ease-out and spring curves, 120/200/320ms — Reanimated vs Animated)? Note: the token export itself is owned by the design-system map's token-pipeline ticket (`.scratch/design-system/`) — this ticket decides the RN-side consumption contract against it.

## Answer

Answered as BOSS per the AFK wayfinder convention (charter: `agents/boss.md`). Binds against ds-01 (token pipeline, resolved) and ds-05 (per-platform components rule, resolved); ds-03 (white-label derivation) is still open — this answer follows the ds map's recorded decision (per-platform `derivePalette()` executors driven by `palette-recipe.json`) and must be reconciled by ds-03 when it closes.

**Decision: ONE package `@tatame/design-system` with platform entry points via the `exports` field — `./native` subpath for RN — not a separate `@tatame/design-system-native` package. Tokens consumed as the generated TS module from the ds-01 pipeline. Glass = `expo-blur` + `expo-linear-gradient` composition. Quicksand via `expo-font` config plugin + `@expo-google-fonts/quicksand`. Icons = `lucide-react-native`. Motion = Reanimated (v4, SDK 57 default), driven by the motion tokens. White-label = `ThemeProvider` + `useTheme()` context consuming the TS `derivePalette()` executor.**

### 1. Package shape: one package, `exports` subpaths

- Charter fixed decision says "single package consumed by all apps" — a second package would relitigate it for no gain. Layout:

```
packages/design-system/
  tokens/          # ds-01: tokens.json, palette-recipe.json, sd.config.ts → build/{css,ts,rn,compose,swift}
  docs/components/ # ds-05: shared anatomy specs (the cross-platform contract)
  src/web/         # MUI-wrapped implementations
  src/native/      # RN implementations
  package.json     # exports: "." → src/web, "./native" → src/native, "./tokens" → tokens/build/ts, "./tokens/native" → tokens/build/rn
```

- All `exports` targets point at **TS source** (ticket 01: Metro transpiles workspace source via `babel-preset-expo`, no build step, cross-package hot reload; the web bundler compiles TS source equally well). Only the token `build/` outputs are generated artifacts (nx `design-system:tokens` target, cacheable, `dependsOn` from consumers).
- Separation guarantee: the app imports **only** `@tatame/design-system/native` (+ `/tokens/native`); the `.` web entry is never resolvable into the RN bundle by construction. One nx node, one spec dir, one tokens dir — and no web/RN version skew, which a split package would invite.
- RN-only native deps (`expo-blur`, `expo-linear-gradient`, `react-native-reanimated`, `react-native-svg`, `lucide-react-native`) are **peerDependencies** of the package, installed in `apps/mobile-rn` via `expo install` so versions stay SDK-aligned. The package itself stays free of `expo-*` hard deps so the web app's install graph never pulls native modules.

### 2. Tokens

- Consume `tokens/build/rn/tokens.ts` (ds-01: same TS module as web, px as unitless numbers, web-only composites omitted) re-exported as `@tatame/design-system/tokens/native`. No hand-written theme object — the generated module is the only source; radii (cards 18–20, sheets 28 top, inputs 14, pills 999), purple-tinted shadow params, glass ingredients (`glass.bg`, `glass.blur` 20–24, `glass.saturation`, shine stops), and motion (ms numbers + bezier 4-tuples) all arrive from the pipeline.
- Shadows: RN maps the structured shadow tokens to `shadowColor/Offset/Opacity/Radius` + `elevation`; the mapping helper lives in `src/native/lib/shadows.ts` per ds-01's degradation policy.

### 3. Theming runtime (white-label + dark)

- `ThemeProvider` (React context) in `src/native/theme/` resolves the active theme: static Lumira defaults (light) → optional dark set → optional white-label overlay from **`derivePalette(deep, vib, accent, mode)`** — the TS executor from ds-01 (OKLab mix via culori or the ~30-line inline mix, driven by `palette-recipe.json`; `color-mix` does not exist in RN). Components read via `useTheme()`; styles are theme-taking `StyleSheet` factories — **no CSS-in-JS runtime** (styled-components/emotion/unistyles rejected: extra dep + runtime for what a hook covers).
- Academy palette (3 colors) comes from the academy config after login (`whoami`/academy payload, per ticket 04's session context); derived once per palette change, memoized. Cache the last palette in AsyncStorage (non-sensitive) so offline cold start (ticket 04/05) renders branded, not default purple.
- Dark theme: same provider, `mode: 'dark'` selects the dark token set + dark `W` anchor in `derivePalette` (ds-01's `applyTema()` remix). Aluno's profile switch writes this; system scheme is the initial default.
- This closes the map fog item "dark theme + white-label runtime theming mechanics in RN".

### 4. Signature surfaces

- **Glass** (GlassTabBar, BottomSheet, Toast, Switch thumb — the handoff's "only floating interactive surfaces, never glass on glass"): `expo-blur` `BlurView` (intensity mapped from `glass.blur`, tint from theme mode) + `glass.bg` rgba wash. **Gradient borders/shine**: RN has no border-image — compose with `expo-linear-gradient` as a 1px-padded wrapper (gradient border) + absolute-positioned shine gradient overlay, encapsulated once in a `GlassSurface` primitive that all glass components use. Android: enable `experimentalBlurMethod`; documented fallback if perf disappoints on low-end devices = higher-opacity `glass.bg` without blur (token-level fallback value, no component API change).
- **GlassTabBar / FAB**: consumed by ticket 02's `tabBar` prop; center FAB = `expo-linear-gradient` (purple-500→pink-500 brand gradient from tokens) + `--shadow-glow` mapping; press feedback `scale(0.97)` via Reanimated.
- **Fonts**: `@expo-google-fonts/quicksand` (300/400/500/600/700) embedded at build time via the **`expo-font` config plugin** (CNG-managed, zero runtime loading/FOUT — beats `useFonts`, whose async load would fight the 1.9s splash). Type styles (25/700 screen titles, 13–14 body, 10 min labels, -0.02em display tracking) come from the token type scale; a `Text` primitive in `src/native` applies family/weight mapping (RN needs explicit `fontFamily` per weight, e.g. `Quicksand_700Bold`).
- **Icons**: `lucide-react-native` (stroke 2, rounded — handoff Assets), sized/colored from tokens. Final cross-platform icon-naming contract belongs to ds-07 (open); RN-side lib choice is fixed here.

### 5. Motion

- **Reanimated, not Animated**: SDK 57 template ships Reanimated v4; UI-thread springs and `Easing.bezier(...)` map 1:1 to the token easings (`ease-out [0.22,1,0.36,1]`, `spring [0.34,1.56,0.64,1]`, 120/200/320ms). Animated rejected: JS-thread jank on the surfaces that matter most here (sheets over blur).
- `src/native/motion.ts` exports named presets built from motion tokens: `fadeUp` (entering: opacity 0→1 + translateY 10→0, 320ms ease-out — used by the `Screen` wrapper per ticket 02), `rise` (BottomSheet translate + scrim fade, 320ms), `pop` (spring — SuccessBurst, check-in), `press` (scale 0.97, 120ms). Apps never hand-write durations/curves — charter rule 4 (no hardcoded design values) applies to motion too.

### 6. Implications for open tickets

- **05 (offline check-in)** / **06 (QR)**: `SuccessBurst`, `QRPanel`, `SegmentedControl`, `BottomSheet` come from `@tatame/design-system/native` — those tickets decide behavior only, no UI building blocks.
- **07 (testing)**: `src/native` components are pure-JS-testable under `jest-expo` with mocks for `expo-blur`/`expo-linear-gradient`; the `GlassSurface` encapsulation means only one mock point for glass. The ds-08 showcase app is the visual regression surface.
- **08 (EAS)**: font embedding + blur are config-plugin/CNG concerns — no manual native config; `expo-doctor` must stay clean after adding the peer deps.
- **ds-03**: when it closes, its ruling on runtime-vs-server derivation must keep the RN contract intact: the app consumes a resolved theme object from `ThemeProvider`; whether `derivePalette` runs on-device or the backend ships resolved colors only swaps the provider's source, not component code.

Status: resolved
