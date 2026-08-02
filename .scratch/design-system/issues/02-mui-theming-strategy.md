# MUI theming strategy for Lumira

Type: grilling
Status: resolved
Blocked by: 01

## Question

How do Lumira tokens map onto an MUI theme so web components come out pixel-faithful to the handoff? Decide: palette mapping (purple-700 primary, pink-500 accent/secondary, purple-950 text — never pure black, gray-50 canvas, semantic success/warning/danger/info); typography (Quicksand 300–700, sentence case, -0.02em display tracking, 25px/700 screen titles, 13–14px body, 10px label floor); shape (cards 18–20px, sheets 28px top, inputs 14px, buttons/chips/tab bar pill 999px — MUI's single `shape.borderRadius` vs per-component overrides); purple-tinted shadows and `--shadow-glow` on primary CTAs; and how glass surfaces (blur 24px, saturate 180%, only on floating interactive surfaces, never glass-on-glass) are expressed — theme-level styleOverrides vs dedicated Glass components. Also decide whether the MUI theme is generated from the token pipeline output or hand-written against it.

## Answer

*(answered as BOSS, per charter)*

**Decision: a runtime theme factory — `createTatameTheme(paletteInput, mode)` in `packages/design-system/src/theme/` — hand-written mapping code that consumes the generated token constants (`build/ts/tokens.ts`, ticket 01) plus the derived brand palette (ticket 03). MUI v6+ with `cssVariables: true`. The theme is never hand-written against raw hex and never fully code-generated: tokens are generated, the mapping is authored.**

### 1. Factory + CSS variables mode

- `createTatameTheme(palette: DerivedPalette, mode: 'light' | 'dark'): Theme`. Input is the resolved palette object from `derivePalette()` (ticket 03) — default Tatame purple when no tenant branding.
- `cssVariables: true` + `colorSchemes: { light, dark }` so MUI emits `--mui-*` custom properties and exposes `theme.vars`. All `styleOverrides` reference `theme.vars.palette.*` — theme swaps (tenant brand at boot, dark toggle) become CSS var flips, not full style recalculation. No re-render storms: the theme object is created once per `(brand, mode)` and memoized; the only place it is rebuilt interactively is the admin white-label live preview (one screen, acceptable).
- Alongside MUI's vars, the pipeline's `tokens.css` keeps the Lumira `--purple-*`/`--glass-*`/`--shadow-*` vars available for the non-MUI styled helpers (glass, belts, gradients). `applyBrand()` (ticket 03) rewrites the Lumira vars; `createTatameTheme` receives the same resolved object — the two layers can never disagree because both are fed from one `derivePalette()` output.
- Quicksand self-hosted via `@fontsource/quicksand` (300–700) — no Google Fonts CDN at runtime.

### 2. Palette mapping

| MUI slot | Lumira token |
|---|---|
| `primary.main / light / dark / contrastText` | `purple-700 #4F2389` / `purple-500` / `purple-800` / `white` |
| `secondary.main / light / dark / contrastText` | `pink-500 #EC5BAE` / `pink-300` / `pink-700` / `white` |
| `success / warning / error / info` `.main` | `success-500 #2BB673` / `warning-500 #F0A020` / `danger-500 #E04359` / `info-500 #5B7DF5`; `.light` slots from the matching `*-100` tints |
| `text.primary / secondary / disabled` | `purple-950 #1A0B2E` (`--fg-1`) / `purple-800` (`--fg-2`) / `gray-500` (`--fg-4`) — **never `#000`**; `common.black` is remapped to `purple-950` as a tripwire |
| `background.default / paper` | `gray-50 #FAF9FC` / `white` |
| `divider` | `gray-200` |
| `grey` scale | Lumira `gray-50…950` verbatim |
| `action.focus` | derived from `--focus-ring` color (purple-500 @ 40%) |

### 3. Typography (px-faithful, MUI variants remapped to product scale)

`fontFamily` = Quicksand stack; global `button.textTransform: 'none'` (sentence case everywhere).

| Variant | Spec |
|---|---|
| `h1` (screen title) | 25px / 700 / tracking -0.02em / lh 1.15 |
| `h2` | 20px / 700 / -0.02em |
| `h3` | 18px / 600 |
| `subtitle1` | 16px / 600 |
| `body1` | 14px / 400–500 |
| `body2` | 13px / 400 |
| `caption` | 12px / 400, color `fg-3` |
| `overline` (eyebrow) | 11px / 600 / uppercase / tracking 0.08em, color `brand-2` |
| `button` | 15px / 700 |

10px is the absolute label floor (chip micro-labels only); nothing in the theme goes below it. Values authored in px (handoff is pixel-faithful mobile-first; rem scaling buys nothing here).

### 4. Shape + shadows

- `shape.borderRadius: 14` (the input/base radius). Larger radii come from component overrides, not a global multiplier: Card/Paper 18–20, sheets/dialogs 28 top, buttons/chips/tab bar `999` (pill). Tokens `radius-md/lg/xl/pill` are the only sources.
- `theme.shadows` (25 slots) rebuilt from the purple-tinted token scale: 0=none, 1=`shadow-xs`, 2–3=`sm`, 4–7=`md`, 8–15=`lg`, 16–24=`xl` (plateau mapping, no interpolation — only the 5 named levels exist in the design). `--shadow-glow` is **not** in the array; it ships as a named mixin (`glowShadow`) applied only by the primary-CTA override.

### 5. Component overrides (`components.*` in the factory)

- `MuiButton`: pill radius; weight 700; `containedPrimary` gets `glowShadow` + active `scale(0.97)`; hover elevates xs→md; sizes map to the 15px/700 spec; `secondary`/`ghost`/`danger` variants align with the `TatameButton` contract (ticket 05) — `TatameButton` on web is a thin wrapper over this themed MuiButton.
- `MuiOutlinedInput`/`MuiTextField`: radius 14, border `border-1`→`border-2` on hover, focus ring from `--focus-ring`; `FormField` wraps it.
- `MuiChip`: pill radius, 12–13px/600 labels.
- `MuiSwitch`: glass thumb (white thumb + `glass-shadow`-style inset highlight), track `purple-700` when checked.
- `MuiDrawer` (anchor bottom) + `MuiDialog`: top radius 28, glass-deep surface, `rise` 320ms `ease-out` over `--bg-overlay` scrim (transition tokens from motion set).
- `MuiPaper`/`MuiCard`: radius 20, `shadow-sm` default; `hero`/`tinted`/`glass` looks are `Card` component variants, not global overrides.
- `MuiCssBaseline`: injects app canvas bg, text color, font smoothing, `::selection` (purple-200/purple-950).
- Not themed: `MuiBottomNavigation` (GlassTabBar is fully custom), any MUI component outside the ticket-05 inventory.

### 6. Glass surfaces — styled helpers, not theme-level overrides

Glass ships as mixins in `packages/design-system/src/theme/glass.ts`:

- `glassSurface(variant: 'regular' | 'deep')` → returns the CSS object: `background: var(--glass-bg | --glass-bg-deep)`, `backdrop-filter: blur() saturate(180%)` (+ `-webkit-` twin), `border: 1px solid var(--glass-border)`, `box-shadow: var(--glass-shadow)`, plus the `::before` shine overlay. `regular` uses blur 20 (token default — toasts, switch thumbs); `deep` uses blur 24 (sheets, tab bar — matches prototype sheets). Blur 24 is added to tokens as `glass.blur-strong`.
- Rule enforced by docs (component specs must name their surface): glass only on floating interactive surfaces — tab bar, sheets, toasts, switch thumbs — **never glass-on-glass**. Content inside a glass sheet uses solid `bg-surface` cards.
- Mixins consume CSS vars, so they follow white-label and dark-mode var flips for free.

Sheet-based components (`BottomSheet`, `Toast`, `GlassTabBar`) apply the mixin; MUI's Drawer/Dialog overrides in §5 reuse the same mixin so there is exactly one glass definition.
