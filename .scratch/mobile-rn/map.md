# Wayfinder map: React Native (Expo) app architecture

Label: wayfinder:map

## Destination

A locked Expo/React Native app architecture for all Tatame personas — workspace integration, navigation model, design-system consumption, auth/session handling, offline/optimistic check-in, QR scanning, and testing strategy decided — ready for feature delivery to start with authentication.

## Notes

- Domain: mobile-first SaaS for jiu-jitsu academy management. Business rules and personas live in `agents/boss.md`; UI/UX source of truth is the design handoff (`/Users/gupy/Desktop/design_handoff_jiujitsu_app/README.md` — especially "Interactions & Behavior" and "Assets") with 6 interactive `.dc.html` prototypes and 79 screenshots.
- **This project runs wayfinder AFK**: grilling tickets are answered by the BOSS charter (`agents/boss.md`); only genuinely undecidable questions escalate to the human.
- Fixed decisions (do not relitigate): nx + pnpm monorepo at `/Users/gupy/apps/tatame`; React Native Expo (TypeScript) is one of 3 parallel mobile implementations (with Kotlin and Swift); TanStack Query on web sets the data-fetching precedent; Lumira design system tokens are the source of truth, consumed from the shared design-system package.
- Feature delivery order is **DB → backend → web → mobiles**, and **RN is first among the mobiles** — this map's decisions become the reference the Kotlin and Swift maps mirror for parity.
- Design constraints to honor: glass/blur surfaces (tab bar, sheets, toasts) need `expo-blur` — CSS `backdrop-filter` does not exist in RN; the floating pill tab bar with gradient center FAB is a custom component, not a stock tab bar; icons are Lucide (`lucide-react-native`); motion specs (fadeUp/rise/pop, 120/200/320ms, spring curves) come from the handoff.
- Skills to consult: `/Users/gupy/LLM_WIKI/raw/skills/expo/`, `/Users/gupy/LLM_WIKI/raw/skills/react-native/`, `/Users/gupy/LLM_WIKI/wiki/tools/react-native.md`, `/Users/gupy/LLM_WIKI/raw/skills/react/`.
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- Plain `create-expo-app` at `apps/mobile-rn` (NOT `@nx/expo` — it lags at SDK 56 with no path to 57); Expo SDK 57, CNG/prebuild, pnpm default isolated linker (hoisted fallback documented), zero manual Metro config (`expo/metro-config` auto-detects the workspace), nx targets inferred from package.json scripts — `issues/01-expo-setup-under-nx.md`
- Auth: access token in memory + refresh token in `expo-secure-store` (device-only, <2 KB); refresh via shared openapi-fetch middleware with single-flight 401 lock (matches web); splash → silent refresh → role-scoped home, else login; ONE binary for Aluno/Professor/Responsável switched by role claim (plataforma/admin = web-only in v1); suspension = blocking screen, delinquency = read-only flag; logout clears secure-store + `queryClient.clear()` → login — `issues/04-auth-session-storage.md`
- Navigation: expo-router (typed routes; wraps react-navigation) — public group + `convite/[token]` outside guards + 3 persona shells `(aluno)`/`(professor)`/`(responsavel)` gated by `Stack.Protected` on the role claim; each shell = JS `Tabs` with design-system `GlassTabBar` as custom `tabBar` (NativeTabs rejected), center FAB is an action (opens sheet route), not a route; sheets = `transparentModal` routes with DS BottomSheet owning the `rise` motion; fadeUp = stack `fade` + Reanimated entering in a DS `Screen` wrapper; `tatame://convite/:token` via scheme, universal links = fog until web domain fixed — `issues/02-navigation-and-multi-persona.md`
- Design-system consumption: ONE `@tatame/design-system` package with `exports` subpaths (`./native`, `./tokens/native` — TS source, Metro-transpiled; native deps as peerDependencies installed via `expo install`); tokens = generated `build/rn/tokens.ts` from ds-01 pipeline; theming = `ThemeProvider`/`useTheme` + TS `derivePalette()` (OKLab) with academy palette from session, AsyncStorage-cached, dark via same recipe; glass = `GlassSurface` primitive (expo-blur + expo-linear-gradient border/shine, Android fallback documented); Quicksand via expo-font config plugin (@expo-google-fonts/quicksand); icons lucide-react-native; motion = Reanimated v4 presets (`fadeUp`/`rise`/`pop`/`press`) built from motion tokens — `issues/03-design-system-consumption-rn.md`

## Not yet specified

- Push notifications (Expo Notifications vs FCM/APNs direct, token registration, per-persona notification routing) — depends on backend notification design; sharpens once backend notification entities and the auth flow land.
- Universal/App links for the invite flow (`https://<domain>/convite/:token` + AASA/assetlinks hosting) — custom scheme `tatame://convite/:token` decided in ticket 02; the https variant hangs on the production web domain (Netlify) being fixed.
- Store purchase flows in-app (Pix/boleto/card sheets, Stripe integration surface on mobile) — depends on backend billing design and Stripe sandbox wiring.
- ~~EAS build/submit pipeline and app-store delivery~~ — graduated to `issues/08-eas-build-pipeline.md` after ticket 01 fixed SDK 57 + CNG.
- ~~Dark theme + white-label runtime theming mechanics in RN~~ — closed by ticket 03 (ThemeProvider + TS `derivePalette()` per ds-01 recipe); only ds-03's runtime-vs-server ruling can still swap the provider's palette source (component contract unaffected).
- Biometric unlock gating of the refresh token (`expo-secure-store` `requireAuthentication`) — deliberately out of v1 (ticket 04); the storage call site isolates the option so it can be flipped on later.

## Out of scope

- Chat/comunicados — handoff design backlog, not designed.
- Multi-unit academies — handoff design backlog.
- Real geolocation check-in verification in v1 — handoff design backlog; v1 ships QR/code/manual methods only.
