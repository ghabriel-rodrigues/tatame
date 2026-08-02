# Design-system consumption in React Native

Type: grilling
Blocked by: 01

## Question

How does the RN app consume the shared Lumira design-system package — token format (JS/TS theme object vs generated constants), theming runtime for white-label (3-color palette → derived scale, since CSS `color-mix(in oklab)` is unavailable in RN), and the component strategy for the handoff's signature surfaces: glass/blur (tab bar, sheets, toasts) via `expo-blur`, the custom floating pill tab bar with gradient center FAB, Quicksand font loading, pill radii, purple-tinted shadows, and the motion spec (fadeUp/rise/pop, ease-out and spring curves, 120/200/320ms — Reanimated vs Animated)? Note: the token export itself is owned by the design-system map's token-pipeline ticket (`.scratch/design-system/`) — this ticket decides the RN-side consumption contract against it.
