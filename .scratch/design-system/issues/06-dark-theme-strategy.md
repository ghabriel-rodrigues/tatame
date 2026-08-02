# Dark theme strategy

Type: grilling
Status: open
Blocked by: 03

## Question

How do we port the prototypes' `applyTema()` dark theme — tokens, glass, and palette remixed via `color-mix` — into the design system? Decide: whether dark theme is a second semantic token set emitted by the pipeline or a runtime transform composed with the white-label derivation (order of operations: palette derivation then dark remix); how glass surfaces and purple-tinted shadows adapt in dark mode; which personas ship dark theme (handoff: functional switch exists in Aluno and Admin; Professor/Responsável/Plataforma dark theme is explicitly in the design backlog — decide whether the token layer supports all personas from day one even if UI toggles ship later); and how the theme choice propagates on each platform (MUI palette mode, RN theme context, Compose/SwiftUI dark variants).
