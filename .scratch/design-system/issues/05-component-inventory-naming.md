# Component inventory and naming

Type: grilling
Status: resolved

## Question

From the 79 screenshots and 6 prototypes, what is the canonical inventory of shared design-system components, and what is each one named? Candidates visible across personas: buttons (primary glow CTA, secondary, ghost), chips/pills (filters, weekday selectors, plan features, recurrence), bottom sheets (glass, 28px top radius, `rise` animation), floating glass tab bar (4 tabs + central gradient FAB, active pill w/ label), belt bar (CSS-drawn belt + degrees), stat tiles (presence %, streak, MRR), hero cards (immersive gradient vs compact white variants), timeline (graduation history), segmented controls (check-in methods, cadastros), toasts (glass pill), avatars (initials on gradient), list rows, empty states, status badges (Ativa/Trial/Inadimplente/Suspensa; payment states), form inputs, switches (glass thumb), calendars/day pickers, QR display, progress bars. Decide the naming convention, which components are cross-platform contracts (same name + props on web and RN) vs platform-specific, and the layering (primitives vs composed persona-level blocks).

## Answer

*(answered as BOSS, per charter)*

### Architecture ruling first

Tokens are shared across all 4 platforms (ticket 01). **Components are implemented per-platform** — MUI wrap for web, RN components for Expo, Compose for Android, SwiftUI for iOS — following a **shared naming + anatomy spec** kept in `packages/design-system/docs/components/<Name>.md`. No "headless core" abstraction across web/RN: it buys nothing for Kotlin/Swift (which can never share it) and fights MUI on web. The spec file is the contract; the four implementations are its executors. This mirrors our token decision: one recipe, four executors.

### Naming + prop-shape conventions

- **PascalCase, no `Tatame` prefix** — the package namespace disambiguates. Single exception: **`TatameButton`**, because `Button` collides with a native/framework component on every one of the 4 platforms.
- Each spec doc defines: anatomy (slots), **variants**, **sizes**, states, tokens consumed, and motion. Variant/size/state strings are **identical on all platforms** (`variant="primary"` means the same thing in MUI, RN, Compose, SwiftUI).
- Prop vocabulary is platform-neutral in the spec: `variant`, `size`, `tone`, `label`, `disabled`, `loading`, `onPress`. Each platform maps to its idiom (web wrapper maps `onPress`→`onClick`; Compose uses named params; SwiftUI uses initializer args) but may not rename variants or invent new ones locally.
- **Admission rule**: a component enters the package only if it appears in 2+ personas or sits on the auth path. Persona-specific compositions (e.g. the admin revenue hero with its stats grid) are app-level screens assembled from these parts — they stay in the apps.
- Layering: **primitives** (token-consuming atoms: TatameButton, Chip, Avatar…) and **composed** (built from primitives: GlassTabBar, BottomSheet, CalendarMonth…). No third layer inside the package.

### Inventory v1

**P0 — auth/login (first feature per charter: authentication)**

| Component | Notes |
|---|---|
| `TatameButton` | variants `primary` (glow CTA, `--shadow-glow`), `secondary`, `ghost`, `danger`; `loading` state; pill radius |
| `FormField` | label + input + helper/error; password visibility toggle; 14px radius; glass-layered variant |
| `Card` | base surface; variants `surface` (white, 18–20px radius), `hero` (immersive purple gradient), `tinted` (brand-tint wash), `glass` |
| `Toast` | glass pill, centered above tab bar, auto-dismiss ~2.6s |
| `BrandLogo` | CSS/vector-drawn belt placeholder (white bar + dark tip, 2 stripes); swappable for academy logo (white-label) |
| `ScreenHeader` | eyebrow date/context + greeting/title + trailing icon buttons + avatar (every persona's first screen after login) |

**P1 — core app shell**

| Component | Notes |
|---|---|
| `GlassTabBar` | floating glass pill, 4 tabs + center gradient FAB (persona's main action); active tab = purple-700 pill with label, inactive = icon only |
| `BottomSheet` | glass surface, 28px top radius, `rise` 320ms ease-out over `--bg-overlay` scrim |
| `ListRow` | leading icon/avatar slot, title, subtitle, trailing accessory (chevron, badge, button) |
| `Avatar` | initials over brand gradient; size scale; no photos in v1 |
| `Chip` | variants `filter`, `selector` (weekday pills, sizes, recurrence days), `tag` (categories, plan features) |
| `SegmentedControl` | check-in methods, cadastros types, ranking toggle |
| `StatTile` | value + caption; `plain` and `tinted` variants (presence %, streak, degrees, MRR, alunos hoje) |
| `Badge` | status dot/pill: Ativa/Trial/Inadimplente/Suspensa, payment states (Em aberto/Paga), stock alerts, count badges |
| `IconButton` | circular ghost/tinted (header bell, download, back) |
| `Switch` | glass thumb; dark theme, notifications, feature toggles |
| `ProgressBar` | rounded track; brand gradient fill (graduation progress, occupancy) |
| `BeltBar` | signature component: CSS/vector-drawn belt (color band + dark tip + white degree stripes), data-driven belt+degrees; used in Aluno home, Professor dashboard rows, Responsável child cards |
| `InlineAlert` | tinted banner with action ("Mensalidade em aberto" + Pagar) |
| `EmptyState` | icon + message + optional action ("Sem aulas neste dia") |

**P2 — feature-specific**

| Component | Notes |
|---|---|
| `CalendarMonth` | month grid, event/class dots, day selection (4 personas) |
| `QRPanel` | QR display + 4-digit live code display (check-in, chamada ao vivo, Pix) — wraps the real QR lib |
| `Timeline` | graduation history: belt marker, date, professor, note, certificate link |
| `MiniBarChart` | 6-month revenue/MRR bars (admin, plataforma) |
| `Stepper` | invite-flow step indicator (Convite stepped signup) |
| `QuantityStepper` | +/− quantity (store) |
| `PlanCard` | plan name, price, feature chips, highlight ("mais assinado") — SaaS plans + academy mensalidade plans |
| `ProductCard` | store vitrine: image/gallery slot, name, price, stock badge |
| `SuccessBurst` | green `--success-500` circle, `pop` spring animation (check-in success, convite success, payment) |
| `PaletteSwatch` | 3-color white-label picker preview (admin identity config) — drives `derivePalette()` from ticket 01 |

All P0/P1 components are cross-platform contracts (all 4 platforms, same spec). P2 are also contracts but may land web+RN first with native parity recorded as debt in the README, per my review checklist item 6 — never silently dropped.
