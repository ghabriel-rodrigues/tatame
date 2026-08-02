# Belt color tokenization

Type: grilling
Status: resolved
Blocked by: 01

## Question

How do jiu-jitsu belts become first-class design tokens? The prototypes hardcode hex (azul `#1E5CB3`, cinza `#9A9AA2`, amarela `#E8C93D`, ponteira preta `#17141F`) and draw belts in CSS (bar + dark tip with degrees as white stripes) — BOSS forbids hardcoded colors. Decide: the belt token namespace (full adult + kids ladders, white through black/red, coral, kids belts toggleable per academy); degree rendering rules as tokens or component contract (stripe count, stripe color, tip color, black-belt dan bars, red-belt treatment); whether belt tokens are static brand-independent tokens (belts never re-theme under white-label) or a separate token category exempt from palette derivation; and how the data-driven graduation model (other belt-based arts later, per boss.md) constrains the token structure — belt tokens keyed by data, not by hardcoded belt names in components.

## Answer

*(answered as BOSS, per charter)*

**Decision: belts are static, brand-independent tokens under `color.belt.*` — fully exempt from white-label derivation AND dark remix (a blue belt is blue in every academy and every theme; only the surface behind it changes). The design system ships the color map + the `BeltBar` rendering rules keyed by slug; the DB owns the ladder (order, degrees, kids flag) so graduation stays data-driven per the charter.**

### 1. Token namespace — `color.belt.*` in `tokens.json` (completes the 4 seeded in ticket 01)

Belt color slugs are English (code is English); pt-BR names are display data from the DB.

| Slug | pt-BR | Hex | Source |
|---|---|---|---|
| `belt.white` | branca | `#EDEAE2` | prototype graduation timeline |
| `belt.gray` | cinza | `#9A9AA2` | handoff README |
| `belt.yellow` | amarela | `#E8C93D` | handoff README |
| `belt.orange` | laranja | `#E8833D` | prototypes |
| `belt.green` | verde | `#3D8B4F` | prototypes |
| `belt.blue` | azul | `#1E5CB3` | handoff README |
| `belt.purple` | roxa | `#6B2DBA` | prototypes |
| `belt.brown` | marrom | `#6B4A2D` | prototypes |
| `belt.black` | preta | `#17141F` | handoff README (= ponteira hex) |
| `belt.red` | vermelha | `#B3261E` | prototypes |

Structural tokens (same namespace, not belt colors):

- `belt.tip` `#17141F` — default ponteira.
- `belt.stripe` `#FFFFFF` — degree stripes.
- `belt.outline` `rgba(26,11,46,0.14)` — hairline inset border so light belts (white, yellow, gray) hold their edge on any surface; harmless on dark belts, so applied uniformly.

Note `belt.purple #6B2DBA` incidentally equals default `--purple-600`; it stays a literal — belt tokens never reference the brand scale, or white-label would repaint belts.

### 2. Static and exempt — by construction

- Belt tokens live in `tokens.json` only; they never appear in `palette-recipe.json`, so `derivePalette()` cannot touch them.
- No dark-mode variant set: same hex in both modes. Contrast in dark mode is handled by `belt.outline` + the component's surface, not by remixing belt colors.
- BOSS checklist item 4 satisfied: prototypes' hardcoded hexes (timeline `#1E5CB3`, `#EDEAE2`, etc.) are now first-class tokens; any hex literal for a belt in app code is a review reject.

### 3. Data-driven structure — DB owns the ladder, tokens own the colors

The design system exports a color map + a definition contract, never a hardcoded ladder:

```ts
type BeltColorSlug = 'white'|'gray'|'yellow'|'orange'|'green'|'blue'|'purple'|'brown'|'black'|'red';
const BELT_COLORS: Record<BeltColorSlug, string>; // from generated tokens

type BeltDef = {
  slug: string;            // DB identity, e.g. 'bjj-adult-blue'
  name: string;            // display, pt-BR from DB: 'Faixa azul'
  colorSlug: BeltColorSlug;    // -> BELT_COLORS
  tipColorSlug?: BeltColorSlug;// default: belt.tip token; black belt sets 'red'
  maxDegrees: number;      // 4 for adult colored belts; dan count for black
  kids?: boolean;
};
```

- The graduation model (backend effort) stores per-academy/per-art ladders as ordered `BeltDef` rows — v1 seed is the handoff ladder Branca→Cinza→Amarela→Laranja→Verde→Azul→Roxa→Marrom→Preta→Vermelha, kids belts (cinza/amarela/laranja/verde) toggleable per academy per charter.
- Components receive a `BeltDef` (+ current `degrees`) and render; they never switch on belt names. Other belt-based arts later (judo, karate) reuse the same color map — new ladders are DB rows, zero component changes. A genuinely new color (e.g. judô coral variants) is a token release: colors are design property, ladders are data.
- IBJJF kids split-color variants (cinza-branca etc.) are NOT in v1: the handoff draws solid kids belts. The `BeltDef` contract can grow a `secondaryColorSlug` later without breaking anything — recorded as forward-compat, not built now.
- Unknown `colorSlug` at runtime → render `gray` + log a warning (defensive default; keeps old clients alive if the DB gains a color before the app updates).

### 4. BeltBar anatomy spec (`docs/components/BeltBar.md` — contract for all 4 platforms)

Drawn with primitives (divs/SVG on web, Views on RN, Canvas/Box on Compose, Shapes on SwiftUI) — never images.

- **Bar**: horizontal rounded rect (`radius-xs` 6), fill = `BELT_COLORS[colorSlug]`, inset `belt.outline` hairline. Sizes: `sm` (list rows — Professor roll call, Responsável child cards), `md` (cards — Aluno home, timeline markers), `lg` (hero/graduation screen). Width fluid, height fixed per size.
- **Ponteira (tip)**: solid block at the right end, ~22% of bar width, color = `tipColorSlug ?? belt.tip`.
- **Degrees**: vertical `belt.stripe` white stripes rendered ON the ponteira, count = current degrees, max 4 for colored belts, evenly spaced.
- **Black belt (dan variants)**: `tipColorSlug: 'red'` (red ponteira, IBJJF), `maxDegrees: 6` in v1 — dan stripes are white on the red tip. 7th/8th (coral) and beyond are not designed in the handoff → design backlog, but they are just future `BeltDef` rows.
- **Red belt**: solid `belt.red` bar, default dark tip, no degree stripes in v1 (9th/10th display is data-driven if ever needed).
- **White belt**: `belt.outline` is what keeps it visible — spec calls this out so no platform "fixes" it with a gray fill.
- `BrandLogo` (ticket 05) reuses this exact anatomy frozen at white bar + dark tip + 2 stripes — one drawing routine, two components.

### 5. Consequence for ticket 01 outputs

The full `color.belt.*` set flows through the existing pipeline untouched: CSS vars (`--belt-blue`), TS constants, Compose object, Swift enum — belts get platform parity for free. No new pipeline work beyond adding the tokens.
