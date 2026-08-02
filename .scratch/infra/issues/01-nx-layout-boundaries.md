# nx project layout & module boundaries

Type: grilling

## Question

What is the nx workspace layout and boundary ruleset? Decide: the `apps/` list (api, web, mobile-rn; whether Kotlin and Swift native apps live inside the nx workspace as projects, beside it in the repo, or in dedicated directories with their own tooling), the `packages/`/`libs/` taxonomy (design-system, shared types/API contracts, domain libs, config presets), naming and tagging conventions, the `@nx/enforce-module-boundaries` tag rules (e.g. apps may not import each other; design-system depends on nothing app-specific; API contract types shared to TS clients only), and pnpm workspace vs nx project inference conventions.
