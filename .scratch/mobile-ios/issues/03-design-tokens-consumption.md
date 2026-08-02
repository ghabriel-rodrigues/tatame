# Design tokens consumption (Lumira → SwiftUI)

Type: grilling
Blocked by: 01

## Question

How does the iOS app consume Lumira design tokens? The token *export* (platform outputs generated from the single source of truth) is owned by the design-system map's **token-pipeline ticket** (`.scratch/design-system/`) — cross-map blocking isn't wireable natively, so treat that ticket as a soft prerequisite and align this decision with its output format. Decide here: the consumption contract (generated Swift file — `Color`/`Font`/spacing constants or a theme struct — vs asset catalog generation vs parsing a JSON artifact), how the export lands in the out-of-nx-graph Xcode project (committed generated file vs build-phase script copying from `packages/design-system`), runtime white-label re-theming (3-color palette → derived scale, replicating the `color-mix(oklab)` derivation in Swift), dark theme mapping, belt colors as tokens (BOSS rule: no hardcoded colors, belts included), Quicksand font bundling, and how Lumira glass specs map onto SwiftUI materials.
