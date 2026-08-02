# MUI + design-system integration on web

Type: grilling
Status: open
Blocked by: 01, design-system/issues/02-mui-theming-strategy.md, design-system/issues/03-white-label-palette-derivation.md

## Question

How does the web app consume `packages/design-system`? (Blocked by the design-system map: MUI theming strategy and white-label palette derivation must be locked there first.) Decide: how the app wires the Lumira-skinned MUI theme (ThemeProvider setup, CssBaseline, Quicksand font loading strategy); how the white-label palette for the active academy is applied at runtime on web (CSS variable injection point, flash-of-default-theme avoidance on load); how dark mode toggling composes with the tenant palette; whether app screens may use raw MUI components or only design-system exports (lint-enforceable boundary); and how phone-framed designs translate to web layout (max-width mobile shell vs responsive desktop layouts — depends on the routing/persona-priority decision).
