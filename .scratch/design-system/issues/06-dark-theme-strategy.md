# Dark theme strategy

Type: grilling
Status: resolved
Blocked by: 03

## Question

How do we port the prototypes' `applyTema()` dark theme — tokens, glass, and palette remixed via `color-mix` — into the design system? Decide: whether dark theme is a second semantic token set emitted by the pipeline or a runtime transform composed with the white-label derivation (order of operations: palette derivation then dark remix); how glass surfaces and purple-tinted shadows adapt in dark mode; which personas ship dark theme (handoff: functional switch exists in Aluno and Admin; Professor/Responsável/Plataforma dark theme is explicitly in the design backlog — decide whether the token layer supports all personas from day one even if UI toggles ship later); and how the theme choice propagates on each platform (MUI palette mode, RN theme context, Compose/SwiftUI dark variants).

## Answer

*(answered as BOSS, per charter — closed while writing spec 011)*

**Decision: dark theme is a second static token set + the `derivePalette(brand, 'dark')` overlay, in the order ticket 03 already fixed — and by the time this closes, the color side has shipped with spec 002.**

1. **Token architecture — already landed.** The pipeline emits the static dark set (`darkTokens`, the `applyTema()` neutral/glass/semantic remix) alongside light; `derivePalette` takes `mode` and encodes the dark anchors and ink mixes. Runtime composition = static dark set first, brand-scale overlay second. Nothing left to decide; `createTatameTheme(derived, 'dark')` and native `createTheme({ brand, mode })` both consume it today. Glass surfaces and purple-tinted shadows have their dark values in the static set (not derived) — same as the prototypes.
2. **Personas.** The token layer supports every persona from day one (it is persona-agnostic). Functional toggles ship in Phase 11 (spec 011): Aluno mobile switch (RN/Android/iOS) and the Admin web console toggle in Configurações. Professor/Responsável/Plataforma toggles stay in the design backlog — recorded debt, zero token work when they land.
3. **Preference model.** Dark theme is a **per-user, client-side preference** — localStorage (web), AsyncStorage (RN), DataStore (Android), UserDefaults (iOS). The prototype's academy-level "Tema escuro" availability toggle is dropped as a prototype-only affordance: no `dark_theme_enabled` academy column, no server involvement (decision recorded in spec 011). v1 toggle is explicit two-state, default light — system-scheme follow (`prefers-color-scheme` / `isSystemInDarkTheme`) is recorded debt, not wired.
4. **Propagation per platform.** Web: flip `data-theme="dark"` on the document root (both variable layers key off it) and swap the memoized `createTatameTheme(derived, mode)`. RN: `ThemeProvider` `mode` prop from the persisted preference. Compose: `TatameTheme(darkTheme = preference)` (not `isSystemInDarkTheme()` in v1). SwiftUI: `TatameTheme(brand:mode:)` environment value from the preference.
