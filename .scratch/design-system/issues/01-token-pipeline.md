# Token pipeline: Lumira CSS to multi-platform outputs

Type: research
Status: resolved

## Question

How do we turn `colors_and_type.css` (Lumira CSS custom properties: color scales, semantic tokens, type scale, spacing, radii, shadows, glass, motion) into a single-source token pipeline that emits per-platform artifacts? Evaluate style-dictionary (and alternatives such as Tokens Studio / Terrazzo / cobalt) for producing: CSS variables + typed TS constants for web, TS constants for React Native, XML resources and/or Compose `Color`/`Typography` objects for Kotlin, and Swift assets (`Color` extensions / asset catalogs) for iOS. Decide the canonical token format (DTCG JSON?), where the pipeline lives in the nx monorepo, how composite tokens (shadows, glass surfaces, motion curves) degrade on platforms that can't express them natively, and how the runtime-only prototype tokens (`--purple-ink`, `--pink-ink`) get promoted into the canonical set.

## Answer

**Decision: single `tokens.json` (W3C DTCG format) in `packages/design-system/tokens/`, built by style-dictionary v4 into all four platform targets. `colors_and_type.css` is converted once into that JSON and then frozen as a design reference — never a build input again.**

### 1. Canonical format

- One `tokens.json` in W3C DTCG format (`$value`/`$type`, group nesting). style-dictionary v4 parses DTCG natively.
- Two mode dimensions encoded as token sets in the same file: `light` (default) and `dark` (values from the prototypes' `applyTema()` remix table — see `App Jiu-Jitsu - Aluno.dc.html:1003`).
- The two known gaps become first-class tokens at conversion time:
  - `color.ink.purple` / `color.ink.pink` (runtime-only `--purple-ink`/`--pink-ink` in prototypes; light values: `deep` and `mix(acc 64% #3B0A24)`; dark values: `mix(vib 65% #FFF)` and `mix(acc 60% #FFF)` — from `applyPalette()` lines 1026–1027).
  - `color.belt.blue #1E5CB3`, `color.belt.gray #9A9AA2`, `color.belt.yellow #E8C93D`, `color.belt.tip #17141F` seeded now; ticket 04 completes the full belt ladder under the same `color.belt.*` namespace.

### 2. Tool: style-dictionary v4 — not hand-rolled, not Terrazzo/cobalt/Tokens Studio

- style-dictionary v4: native DTCG input, built-in transform groups + formats for every target we need (`css/variables`, `javascript/es6` + `typescript/es6-declarations`, `compose/object`, `ios-swift/enum.swift`, `android/resources`), custom formats are plain JS functions, runs cleanly as an nx target with cacheable inputs/outputs.
- Hand-rolled script rejected: it would reimplement 4 platforms' worth of transforms (units, color formats, naming) that style-dictionary already maintains; custom needs are covered by ~3 small custom transforms/formats.
- Terrazzo/cobalt rejected (weaker/absent Compose + Swift outputs); Tokens Studio rejected (it is a Figma-sync tool; there is no Figma in this flow).

### 3. Outputs (nx target `design-system:tokens`)

| Target | Artifact | Notes |
|---|---|---|
| Web | `build/css/tokens.css` + `build/ts/tokens.ts` | CSS custom properties (static defaults, `[data-theme="dark"]` block) + typed constants consumed by the MUI theme factory (ticket 02) |
| React Native | `build/rn/tokens.ts` | same TS module, px as unitless numbers, web-only composites omitted |
| Android | `build/compose/LumiraTokens.kt` | Compose `object` with `Color`/`Dp`/`TextStyle` + `darkColorScheme` values. Compose object chosen over XML resources (app is Compose-first; XML can be added later as a secondary format if a View-based need appears) |
| iOS | `build/swift/LumiraTokens.swift` | Swift `enum` with static `Color`/`CGFloat`. Enum chosen over asset catalog: code-reviewable diffs and — decisive — asset catalogs are compile-time only, incompatible with runtime white-label override |

Generated outputs are build artifacts (nx cache), committed native copies synced into the Kotlin/Swift projects by the same target's task pipeline.

### 4. Composite tokens — degradation policy

- **Shadows**: stored structured (color/x/y/blur/spread list). Web format joins to `box-shadow` strings; Compose maps each named shadow to an elevation dp approximation; iOS/RN map to shadow-modifier params. Named levels (`xs…xl`, `glow`, `inset`) keep identical names everywhere.
- **Glass**: exported as raw ingredients only (`glass.bg` rgba, `glass.blur` 20, `glass.saturation` 1.8, `glass.border`, shine gradient stops). Each platform owns the composite: `backdrop-filter` on web, blur/haze modifier on Compose, custom material on SwiftUI, `expo-blur` on RN. The design-system docs spec the assembly per platform.
- **Motion**: durations as ms numbers; easings as cubic-bezier 4-tuples (`[0.22,1,0.36,1]` etc.). Consumers map: CSS `cubic-bezier()`, Reanimated `Easing.bezier(...)`, Compose `CubicBezierEasing(...)`, SwiftUI `Animation.timingCurve(...)`. This closes the motion-delivery fog item.

### 5. Runtime white-label derivation (cannot be static)

The 3-color → full-scale derivation ships as **code** in the design-system package — one implementation per platform, all driven by a single shared recipe:

- `tokens/palette-recipe.json`: the mix table extracted verbatim from `applyPalette()` (e.g. `purple-800 = mix(deep, 72%, #12061F)`, `purple-300 = mix(vib, 46%, W)` where `W = #FFFFFF` light / `#241E3A` dark). Single recipe, four executors — the recipe is data, so all platforms stay bit-identical in intent.
- **Web**: `applyPalette(deep, vib, accent, mode)` sets CSS custom properties using `color-mix(in oklab, …)` strings — the browser does the math, zero color library needed.
- **TS (RN)**: `derivePalette()` returning a full theme object, OKLab mix via culori (or a ~30-line inline oklab mix to stay dependency-free).
- **Kotlin / Swift**: same `derivePalette()` with a small OKLab utility (~40 lines each: sRGB↔OKLab + linear interpolate), returning Color maps that override the static token defaults in the theme layer.
- Static `tokens.json` keeps the default Lumira purple values as the un-branded baseline; white-label output overlays the derived scale at theme-construction time. Dark mode reuses the same recipe with the dark `W` anchor + the `applyTema()` neutral remix.

### 6. Pipeline location

`packages/design-system/tokens/` → `tokens.json`, `palette-recipe.json`, `sd.config.ts`, custom transforms/formats in `tokens/lib/`. One nx target builds everything; consuming packages/apps depend on it via nx `dependsOn`.
