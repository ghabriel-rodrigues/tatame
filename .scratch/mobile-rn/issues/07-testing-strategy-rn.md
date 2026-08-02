# Testing strategy (RN)

Type: grilling
Blocked by: 01, 02

## Question

What is the RN testing pyramid: unit/component tests (Jest + React Native Testing Library — config under nx/pnpm, transform setup for Expo modules), hook/data-layer tests (TanStack Query test utilities, mocked API via MSW?), and E2E (Maestro vs Detox — Expo compatibility, CI cost)? Decide what "tested" means for the README feature checklist on mobile (which layers are mandatory per feature slice), how navigation flows are tested under the chosen navigator, and how design-token/theming regressions are guarded (snapshot policy).
