# Navigation library & multi-persona strategy

Type: grilling
Status: resolved
Blocked by: 01

## Question

Which navigation approach fits Tatame: expo-router (file-based) or react-navigation (programmatic)? And what is the multi-persona strategy — one app whose UI is switched by the authenticated user's role (Aluno/Professor/Admin/Responsável/Plataforma) vs separate entry points or builds per persona? Decide how the persona-specific tab sets (4 tabs + persona-specific center FAB action), stacked detail views, and glass bottom sheets from the handoff map onto the chosen navigator, and how the public invite flow route coexists with authenticated persona shells.

## Answer

Answered as BOSS per the AFK wayfinder convention (charter: `agents/boss.md`).

**Decision: expo-router (file-based, typed routes) — not react-navigation used directly. One binary, three persona shells (Aluno / Professor / Responsável) selected by the session role claim via `Stack.Protected` guards. Custom glass pill tab bar via the JS `Tabs` navigator's `tabBar` prop rendering the design-system `GlassTabBar` — NOT NativeTabs. Center FAB is not a route.**

### 1. Library: expo-router

- SDK 57's default (`create-expo-app` template ships it) — aligns with ticket 01's "Expo-tooling health beats purity" bias; zero extra scaffolding.
- It **wraps react-navigation**: every navigator we need (stack, bottom-tabs) and every escape hatch (custom `tabBar`, `screenOptions`, navigation ref) remains available. We give up nothing; we gain typed routes (`experiments.typedRoutes`), file-tree-as-spec (useful as the parity reference for the Kotlin/Swift maps), and — decisive for the invite flow — **deep/universal links for free**: every file route is a link target, no manual linking config table to maintain.
- react-navigation-direct rejected: hand-written linking config for `convite/:token`, no typed routes without codegen, and no structural artifact for the native apps to mirror.

### 2. Route tree (one binary, role-gated shells)

Per ticket 04: persona = role claim; Plataforma/Admin roles get a "use the web console" screen, no shell scaffolded.

```
app/
  _layout.tsx                 # root Stack: providers (Theme, QueryClient, fonts),
                              # splash + silent-refresh gate, Stack.Protected role gates
  console-only.tsx            # admin/plataforma roles: "use the web console"
  (public)/
    login.tsx
    forgot-password.tsx       # stub (handoff: "Esqueci minha senha" is a stub)
  convite/[token].tsx         # PUBLIC invite landing + stepped signup (outside role gates)
  (aluno)/
    _layout.tsx               # Tabs + custom GlassTabBar (FAB = check-in sheet)
    (inicio)/  _layout.tsx (Stack) index.tsx graduacao.tsx evento/[id].tsx notificacoes.tsx …
    (agenda)/  _layout.tsx index.tsx
    (carteira)/ _layout.tsx index.tsx boleto.tsx cartao.tsx …
    (perfil)/  _layout.tsx index.tsx dados.tsx loja/ …
    checkin.tsx               # transparentModal sheet route (FAB target)
  (professor)/
    _layout.tsx               # Tabs + GlassTabBar (FAB = chamada)
    (inicio)/ (turmas)/ (alunos)/ (perfil)/ …  chamada.tsx
  (responsavel)/
    _layout.tsx               # Tabs + GlassTabBar (FAB = cadastrar filho)
    (inicio)/ (pagamentos)/ (eventos)/ (perfil)/ …  cadastrar-filho.tsx
```

- **Role gate**: root `_layout.tsx` renders `<Stack.Protected guard={role === 'aluno'}>` around `(aluno)`, etc.; `(public)` guarded by `!session`. Guard flips on login/logout automatically redirect (expo-router removes protected screens from the tree) — this implements ticket 04's "logout resets to login" and "splash → silent refresh → role-scoped home" without imperative resets.
- **Tab sets confirmed from the prototypes** (state keys in the `.dc.html` files): Aluno `inicio/agenda/fin/perfil`; Professor `inicio/turmas/alunos/perfil`; Responsável `inicio/pag/eventos/perfil`. Each tab is a route group with its own nested Stack (per-tab history, handoff's stacked detail views).
- Persona shells share NO route files. Screens that look similar across personas (loja, ranking, calendário) share **components** (`components/`/design-system), never routes — RBAC boundaries stay structural (charter rule 3).

### 3. Custom glass tab bar + center FAB

- **JS `Tabs` from expo-router** (wraps `@react-navigation/bottom-tabs`) with `tabBar={(props) => <GlassTabBar …/>}`. **NativeTabs rejected**: the handoff's floating glass pill (blur 24px, active tab = purple-700 pill with label, gradient center FAB) is unreachable through native tab bar styling on either OS — the wiki's native-tabs skill confirms native tabs can't be restyled to this degree.
- `GlassTabBar` is the design-system component (ds-05, P1); the app passes the 4 route names + icons (lucide-react-native) + the FAB action. Layout: 2 tabs left, FAB, 2 tabs right.
- **The center FAB is not a tab route.** It fires the persona's main action: Aluno → opens `checkin` sheet; Professor → `chamada`; Responsável → `cadastrar-filho`. No dummy 5th route with a `listeners` hack — the FAB slot is first-class in `GlassTabBar`'s API.

### 4. Sheets and transitions

- **Sheet routes** (check-in, chamada, cadastrar filho, Pix payment): screens with `presentation: 'transparentModal'`, `animation: 'none'`, `headerShown: false`; the design-system `BottomSheet` (glass, 28px top radius) owns the scrim fade + `rise` 320ms ease-out via Reanimated, and dismisses with `router.back()`. This keeps sheets deep-linkable and back-button-correct while matching the handoff motion exactly (native `formSheet`/`modal` presentations can't do glass-over-scrim). 
- **Ephemeral pickers** (e.g. weekday selector) are plain component state, not routes. Rule: a sheet becomes a route iff it is a navigation destination (FAB target, deep-linkable, or reachable from multiple screens).
- **Screen transitions**: native-stack presets can't express the handoff's `fadeUp` (fade + 10px rise, 320ms). Ruling: nested Stacks use `animation: 'fade'` (320ms) and screen content mounts with Reanimated `FadeInUp`-style entering (10px, ease-out `cubic-bezier(0.22,1,0.36,1)`) via a design-system `Screen` wrapper — motion tokens from the ds token pipeline (ds-01). Exact mechanics belong to ticket 03/ds; the navigator-level decision is: do not fight native-stack custom transitions.

### 5. Deep links / universal links

- Scheme: `"scheme": "tatame"` in `app.json` → `tatame://convite/:token` maps to `app/convite/[token].tsx` with zero config.
- `convite/[token]` sits **outside** all guards: reachable logged-out (primary case — stepped signup, academy+class+plan inherited, minor requires guardian) and logged-in (show the landing; account linking is a backend concern, out of scope here).
- Universal links (iOS Associated Domains) / App Links (Android `intentFilters`) on `https://<web-domain>/convite/:token`: **fog** — requires the production web domain + hosted AASA/assetlinks files; graduates when the web deploy (Netlify) domain is fixed. The custom scheme ships in v1 regardless; the invite web page can render an "open in app" button using it.

### 6. Implications for blocked tickets

- **05 (offline check-in)**: check-in is the sheet route `(aluno)/checkin.tsx`; offline cold start keeps the role shell alive (ticket 04), so the queue UI lives inside the sheet + a badge on the FAB slot.
- **06 (QR scanning)**: camera screen is a sub-route of the check-in sheet flow (and professor's chamada) — full-screen push, not a sheet.
- **07 (testing)**: expo-router trees are testable by rendering the router with an initial URL (`renderRouter` from `expo-router/testing-library`); the role gates are the first navigation tests to write.
- **08 (EAS)**: typed routes + CNG need no extra EAS config; the `scheme` is CNG-managed.
- **Kotlin/Swift parity**: this file tree is the canonical screen graph the native maps mirror (per map note: RN is first among mobiles).

Status: resolved
