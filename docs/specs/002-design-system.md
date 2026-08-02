# 002 — Design System Foundation

## Problem Statement

Tatame ships four client platforms — React web, React Native (Expo), Kotlin (Compose), and Swift (SwiftUI) — that must all look like the same product: the Lumira design language from the pixel-faithful handoff prototypes. On top of that, every academy is a white-label tenant that re-brands the entire app from just three colors (deep, vibrant, accent) at runtime, and the Aluno persona has a dark theme. Today the design language exists only as a reference CSS file (`colors_and_type.css`) and prototype JavaScript (`applyPalette()`, `applyTema()`): colors, type, radii, shadows, glass, and motion are hardcoded per prototype, belts are drawn with literal hex values, and there is no mechanism for four independent codebases to stay visually identical — or for a tenant's brand to produce the exact same derived palette on web, RN, Android, and iOS.

Without a single token source and a pinned derivation algorithm, the four clients will drift apart screen by screen, white-label colors will differ between a student's iPhone and their guardian's Android, and every hardcoded hex is a review failure waiting to happen (BOSS checklist item 4 forbids hardcoded colors, belts included).

## Solution

One design-system package (`@tatame/design-system`) that is the single source of truth for the Lumira design language, consumed by all four platforms:

- A canonical `tokens.json` (W3C DTCG format) — converted once from the Lumira CSS and then owning the truth — built by style-dictionary v4 into four platform artifacts: CSS variables + typed TS for web, a TS module for React Native, a Compose `object` for Kotlin, and a Swift `enum` for iOS.
- White-label theming as data plus one algorithm: `palette-recipe.json` holds the 3-color → full-scale mix table; a canonical TypeScript `derivePalette()` executes it in OKLab, with line-for-line Kotlin and Swift ports pinned byte-equal by shared golden fixtures. An academy's brand renders identically on every device.
- A hand-authored MUI v6 theme factory (`createTatameTheme`) that maps generated tokens onto MUI with CSS variables mode, so web components come out pixel-faithful and re-brand/dark-toggle via CSS var flips.
- Belt colors as static, brand-independent tokens plus a data-driven `BeltDef` contract and a `BeltBar` anatomy spec, so graduation stays data-driven (other belt-based arts later) with zero hardcoded belt hex in app code.
- A component inventory (P0/P1/P2) implemented per platform under shared anatomy specs — one contract, four executors, identical variant/size/state vocabulary everywhere.

## User Stories

### App users

1. As an Aluno, I want every screen of the app to look exactly like the handoff design (colors, type, rounded surfaces, glass tab bar), so that the product feels polished and coherent.
2. As an Aluno, I want my academy's brand colors applied across the entire app — buttons, headers, gradients, highlights — so that the app feels like my academy's app, not a generic one.
3. As an Aluno, I want a dark theme that keeps my academy's branding intact, so that I can use the app comfortably at night without losing the brand identity.
4. As an Aluno, I want my belt and degrees drawn accurately (correct belt color, dark tip, white stripes) regardless of academy branding or theme, so that my graduation status is always instantly recognizable.
5. As a Professor, I want belt bars in my roll-call lists to look identical to the ones students see, so that there is never confusion about a student's rank.
6. As an Admin da academia, I want to pick 3 brand colors (or a ready-made palette) and see the full app theme derived live, so that white-label setup is instant and requires no design skills.
7. As an Admin da academia, I want the derived brand to look identical on my web dashboard and on my students' phones (iOS and Android alike), so that our brand is consistent everywhere.
8. As a Responsável, I want my children's belt cards and payment statuses to use the same visual language as the rest of the platform, so that the guardian surface feels like part of the same product.
9. As a Plataforma operator, I want the SaaS owner surface to always render the default Tatame brand, so that the platform's own identity is never confused with a tenant's.
10. As an invitee on the Convite flow, I want the signup screens already branded with the academy that invited me, so that I trust the invitation is legitimate.
11. As any user, I want text to always render in deep purple rather than pure black, with the Quicksand typeface and the handoff's spacing and radii, so that the product's personality is preserved on every platform.

### Developers

12. As a web developer, I want a `createTatameTheme(palette, mode)` factory that returns a fully mapped MUI theme, so that I build screens with themed MUI components and never touch a raw hex value.
13. As a web developer, I want MUI CSS variables mode plus the Lumira CSS vars fed from the same derived palette, so that brand swaps and dark toggles are var flips with no re-render storms and no possibility of the two layers disagreeing.
14. As a React Native developer, I want to import only `@tatame/design-system/native` (and `/tokens/native`), so that web code and MUI never leak into my bundle and I get RN-shaped tokens (unitless px, no web-only composites).
15. As a React Native developer, I want the package's native dependencies declared as peerDependencies installed via `expo install`, so that versions stay SDK-aligned and the web app's install graph never pulls native modules.
16. As a Kotlin developer, I want a generated `LumiraTokens.kt` Compose object and a `DerivePalette.kt` port committed into my project, so that I consume the same colors, type, and spacing without hand-transcribing values.
17. As a Swift developer, I want a generated `LumiraTokens.swift` enum and a `DerivePalette.swift` port, so that iOS renders the same design language and runtime white-label works (asset catalogs would be compile-time only).
18. As a native developer (Kotlin or Swift), I want the palette recipe embedded into my port at token-build time, so that the recipe can never drift between platforms.
19. As any client developer, I want golden fixtures (`palette-fixtures.json`) asserted byte-equal in every platform's test suite, so that a drifting `derivePalette` port fails CI instead of shipping mismatched tenant colors.
20. As any client developer, I want component anatomy specs (one per component, shared vocabulary for variants/sizes/states/tokens/motion), so that I implement `TatameButton` or `BeltBar` in my platform's idiom without inventing local variants.
21. As any client developer, I want belt rendering to consume a `BeltDef` object rather than switching on belt names, so that new ladders (judo, karate) are DB rows and require zero component changes.
22. As any client developer, I want motion tokens (durations, bezier curves) and named presets, so that I never hand-write animation values.
23. As a reviewer (BOSS), I want every design value in app code traceable to a token, so that checklist item 4 (no hardcoded colors) is mechanically enforceable.

## Implementation Decisions

Synthesis of the five resolved design-system tickets (token pipeline, MUI theming, white-label derivation, belt tokens, component inventory) plus the RN consumption contract.

### Token pipeline (single source, four targets)

- Canonical source: one `tokens.json` in W3C DTCG format (`$value`/`$type`) inside the design-system package's tokens directory, with light (default) and dark token sets. `colors_and_type.css` is converted once and then frozen as a design reference — never a build input again.
- Runtime-only prototype tokens are promoted to first-class: `color.ink.purple` / `color.ink.pink` (mode-conditional values from the prototypes' `applyPalette()`), and the belt namespace is seeded and completed (see Belt tokens below).
- Build tool: style-dictionary v4 (native DTCG parsing, mature per-platform transforms, runs as a cacheable nx target). Hand-rolled scripts, Terrazzo/cobalt, and Tokens Studio were evaluated and rejected.
- Four outputs from one nx target (`design-system:tokens`): CSS variables + typed TS constants (web), a TS module with unitless px and web-only composites omitted (RN), a Compose `object` with `Color`/`Dp`/`TextStyle` (Android — Compose object over XML resources), and a Swift `enum` with static `Color`/`CGFloat` (iOS — enum over asset catalog, because asset catalogs are compile-time only and incompatible with runtime white-label). Generated native copies are synced into the Kotlin/Swift projects by the same target.
- Composite-token degradation policy: shadows stored structured and mapped per platform (box-shadow strings / elevation dp / shadow-modifier params) under identical level names; glass exported as raw ingredients (bg, blur, saturation, border, shine stops) with each platform owning the composite assembly; motion as ms numbers and cubic-bezier 4-tuples mapped to each platform's easing API.

### White-label derivation (one recipe, one canonical implementation, pinned ports)

- `palette-recipe.json`: the `applyPalette()` mix table transcribed verbatim as data entries (`token`, `base` ∈ deep/vibrant/accent, `pct`, `anchor` — literal hex, input slot, or symbolic `W` resolved per mode: `#FFFFFF` light / `#241E3A` dark). Covers the purple and pink scales plus the ink tokens; neutrals, semantics, and glass are static tokens, not derived.
- Canonical executor: a pure, dependency-free TypeScript `derivePalette(input, mode)` doing sRGB↔OKLab conversion and linear interpolation with CSS `color-mix(in oklab)` semantics, emitting uppercase hex. It is the single source of derived colors on web and RN. The prototypes' CSS `color-mix()` path is dropped for production: identical hex on all four platforms outweighs zero-JS elegance.
- Kotlin and Swift carry line-for-line ports of the same math; the recipe JSON is embedded into both at token-build time so recipes cannot drift. All four implementations are pinned by `palette-fixtures.json` golden fixtures (the 4 ready-made palettes × both modes, expected output generated by the TS executor).
- Derivation is client-side at runtime: the tenant payload stays 3 colors + logo, the server carries zero color code, and the admin identity screen gets instant live preview. Server-side precomputation was rejected.
- Web integration: `applyBrand(derived)` writes plain hex onto the Lumira CSS custom properties; the same `DerivedPalette` object feeds the MUI theme factory, so the two variable layers always agree. Ready-made palettes ship as exported presets (default purple, navy/red, green/gold, black/gold) plus `TATAME_DEFAULT_BRAND`.
- Semantic tokens keep pointing at the raw scales, so the whole app re-brands transitively. Order of operations for dark: static dark token set first, then `derivePalette(brand, 'dark')` overlays the brand scales.

### MUI theming (web)

- `createTatameTheme(palette: DerivedPalette, mode): Theme` — hand-authored mapping code consuming generated token constants; MUI v6+ with `cssVariables: true` and light/dark color schemes. Tokens are generated, the mapping is authored; the theme is never written against raw hex and never fully code-generated.
- Palette mapping: primary = purple-700, secondary = pink-500, semantic slots from the Lumira semantic scales, text from purple-950/purple-800 (never `#000` — `common.black` remapped to purple-950 as a tripwire), background from gray-50/white, grey scale verbatim.
- Typography: Quicksand (self-hosted via fontsource, no CDN), sentence case globally, px-authored variants remapped to the product scale (25px/700 screen titles with -0.02em tracking down to the 10px label floor).
- Shape and shadows: base radius 14 with per-component overrides (cards 18–20, sheets 28 top, pills 999) sourced only from radius tokens; the 25-slot MUI shadow array rebuilt from the 5 purple-tinted named levels via plateau mapping; `--shadow-glow` is a named mixin applied only by the primary-CTA override.
- Component overrides for the inventory components only (Button, inputs, Chip, Switch, Drawer/Dialog, Paper/Card, CssBaseline); glass ships as styled mixins (`glassSurface('regular' | 'deep')`) consumed by both custom components and MUI overrides — exactly one glass definition, and glass only on floating interactive surfaces, never glass-on-glass.

### Belt tokens and graduation rendering

- Belts are static, brand-independent tokens under `color.belt.*` — exempt from white-label derivation (never in the recipe) and from dark remix (same hex both modes; contrast handled by a `belt.outline` hairline and the surface behind the belt). Ten belt colors (white through red) plus structural tokens `belt.tip`, `belt.stripe`, `belt.outline`. `belt.purple` incidentally equals default purple-600 but stays a literal so white-label can never repaint belts.
- The design system exports the color map and a definition contract; the DB owns the ladder. From the resolved ticket:

  ```ts
  type BeltColorSlug = 'white'|'gray'|'yellow'|'orange'|'green'|'blue'|'purple'|'brown'|'black'|'red';
  const BELT_COLORS: Record<BeltColorSlug, string>; // from generated tokens

  type BeltDef = {
    slug: string;              // DB identity, e.g. 'bjj-adult-blue'
    name: string;              // display, pt-BR from DB
    colorSlug: BeltColorSlug;
    tipColorSlug?: BeltColorSlug; // default belt.tip; black belt sets 'red'
    maxDegrees: number;
    kids?: boolean;
  };
  ```

- Components receive a `BeltDef` plus current degrees and render; they never switch on belt names. Unknown color slug renders gray with a warning. Kids split-color variants are forward-compat (`secondaryColorSlug` later), not built now.
- `BeltBar` anatomy is a cross-platform contract: primitive-drawn (never images) rounded bar + tip block (~22% width) + white degree stripes on the tip, three sizes, red tip with white dan stripes for black belt, outline keeping the white belt visible. `BrandLogo` reuses the same drawing routine frozen at white bar + dark tip + 2 stripes.

### Component inventory and packaging

- Components are implemented per platform (MUI wrap on web, RN, Compose, SwiftUI) under shared anatomy specs — no headless core (it could never serve Kotlin/Swift and fights MUI on web). The spec doc is the contract; the four implementations are executors. Naming is PascalCase without prefix, single exception `TatameButton` (name collision on every platform). Variant/size/state strings are identical across platforms; prop vocabulary is platform-neutral and mapped to each platform's idiom.
- Admission rule: a component enters the package only if it appears in 2+ personas or sits on the auth path. Two layers only: primitives and composed.
- P0 (auth path, first feature): `TatameButton`, `FormField`, `Card`, `Toast`, `BrandLogo`, `ScreenHeader`. P1 (app shell): `GlassTabBar`, `BottomSheet`, `ListRow`, `Avatar`, `Chip`, `SegmentedControl`, `StatTile`, `Badge`, `IconButton`, `Switch`, `ProgressBar`, `BeltBar`, `InlineAlert`, `EmptyState`. P2 (feature-specific): calendar, QR panel, timeline, charts, steppers, plan/product cards, success burst, palette swatch — contracts too, but may land web+RN first with native parity recorded as README debt, never silently dropped.
- Package shape (RN consumption contract): ONE package with platform entry points via the `exports` field — `.` → web, `./native` → RN, `./tokens` and `./tokens/native` → generated token modules. Entry points resolve to TS source (Metro and the web bundler both transpile workspace source); only token build outputs are generated artifacts. RN-only native dependencies (blur, gradients, Reanimated, SVG, icons) are peerDependencies installed in the mobile app so the web install graph never pulls native modules. The RN side consumes theming through a `ThemeProvider`/`useTheme()` context resolving static tokens → optional dark set → optional white-label overlay from `derivePalette`.

## Testing Decisions

- **Golden fixture tests for palette parity** (the highest-value seam): `palette-fixtures.json` is generated by the canonical TS executor and asserted byte-equal by TS/RN tests and by Kotlin and Swift unit tests. This is the single guarantee that a tenant's brand renders identically on all four platforms; any port drift fails CI. Tests exercise external behavior only (input brand + mode → output hex map), not the OKLab internals.
- **Token build snapshot tests**: the style-dictionary build output for each of the four targets is snapshot-tested, so accidental token renames, value changes, or format regressions surface in review as readable diffs rather than downstream visual bugs.
- **Visual review against handoff screenshots**: component implementations are verified by human/agent review against the 79 handoff screenshots and prototypes. Per the web effort's resolved decision (web-07), there is NO CI screenshot-diff pipeline in this phase — visual fidelity is a review-time responsibility, with the BOSS checklist (design fidelity, no hardcoded colors) as the gate.
- **Theme factory tests**: `createTatameTheme` gets behavior-level tests (given a derived palette and mode, the returned theme exposes the expected slot values — e.g. primary main, text never pure black, pill radius on buttons), not tests of MUI internals.
- Component-level tests follow each platform effort's own testing strategy (e.g. RN under jest-expo with a single mock point for glass); this spec only mandates that shared-contract behavior (variant names, BeltDef-driven rendering, unknown-slug fallback) is covered on each platform.

## Out of Scope

- **P2 components** — specified in the inventory but not built in phase 1; they land with the features that need them, with cross-platform parity debt tracked in the README.
- **Icon strategy** (ticket 07, open) — the cross-platform icon naming contract and per-platform icon libraries; the RN-side library choice is already fixed but the shared contract is not.
- **Storybook/component showcase** (ticket 08, open) — the showcase app that would serve as visual regression surface.
- **Asset handling** (ticket 09, open) — images, logos, and static asset pipeline (including academy logo upload/delivery for `BrandLogo` swapping).
- **Dark theme rollout beyond the color math** (ticket 06, open) — `derivePalette` already takes `mode` and the dark token set is in `tokens.json`, so the color math is closed here; per-platform propagation and persona rollout land with the Aluno/Admin features that expose the toggle.
- Backend/tenant concerns: the endpoint serving academy branding, the graduation ladder schema and seeds (`BeltDef` rows), and RBAC — owned by the backend effort; this spec only defines the `BrandInput` and `BeltDef` contracts.
- CI screenshot-diff tooling (explicitly rejected for this phase per web-07).

## Further Notes

- The design source of truth remains `/Users/gupy/Desktop/design_handoff_jiujitsu_app/` (prototypes, screenshots, Lumira CSS). After the one-time conversion to `tokens.json`, the CSS file is reference-only.
- Delivery order per the charter (DB → backend → web → mobiles) applies to features, not to this foundation: the token pipeline and package scaffold precede and unblock all client work, which is why this spec ships before feature specs consume it.
- Everything here follows the charter's fixed decisions: single design-system package, Lumira tokens as source of truth, nx + pnpm monorepo, MUI on web, three parallel mobile implementations.

## Delivery Checklist

- [ ] 1. Scaffold `packages/design-system` with the `exports` map (`.`, `./native`, `./tokens`, `./tokens/native`) and peerDependencies declared; both web and RN apps resolve their entry points.
- [ ] 2. Convert Lumira `colors_and_type.css` into DTCG `tokens.json` (light + dark sets, ink tokens, full `color.belt.*` namespace) and freeze the CSS as reference.
- [ ] 3. Wire style-dictionary v4 as the `design-system:tokens` nx target emitting all 4 outputs: `tokens.css` + TS (web), RN TS module, `LumiraTokens.kt`, `LumiraTokens.swift`.
- [ ] 4. Ship `palette-recipe.json`, the canonical TS `derivePalette()`, `applyBrand()`, the 4 ready-made presets, and `palette-fixtures.json` with passing TS golden-fixture tests.
- [ ] 5. Implement `createTatameTheme()` (MUI v6, `cssVariables: true`, palette/typography/shape/shadow mapping, component overrides, glass mixins) with behavior tests, integrated into the web app shell.
- [ ] 6. Implement the six P0 components for web (TatameButton, FormField, Card, Toast, BrandLogo, ScreenHeader) with anatomy spec docs, visually reviewed against the handoff screenshots.
- [ ] 7. Implement the same six P0 components for React Native under `./native` (ThemeProvider, Text primitive, fonts, motion presets included), visually reviewed against the handoff screenshots.
- [ ] 8. Commit the generated Kotlin token export (`LumiraTokens.kt`) plus `DerivePalette.kt` with the embedded recipe into the Android project, golden-fixture unit tests passing.
- [ ] 9. Commit the generated Swift token export (`LumiraTokens.swift`) plus `DerivePalette.swift` with the embedded recipe into the iOS project, golden-fixture unit tests passing.
