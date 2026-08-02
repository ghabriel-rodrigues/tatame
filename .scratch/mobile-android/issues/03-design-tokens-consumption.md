# Design tokens consumption (Lumira → Compose)

Type: grilling
Blocked by: 01

## Question

How does the Android app consume Lumira design tokens? The token *export* (platform outputs generated from the single source of truth) is owned by the design-system map's **token-pipeline ticket** (`.scratch/design-system/`) — cross-map blocking isn't wireable natively, so treat that ticket as a soft prerequisite and align this decision with its output format. Decide here: the consumption contract (generated Kotlin file — Compose `ColorScheme`/custom theme object — vs parsing a JSON artifact at build time), how the export lands in the out-of-nx-graph Gradle project (committed generated file vs Gradle task copying from `packages/design-system`), runtime white-label re-theming (3-color palette → derived scale, replicating the `color-mix(oklab)` derivation in Kotlin), dark theme, belt colors as tokens (BOSS rule: no hardcoded colors, belts included), and Quicksand font packaging.
