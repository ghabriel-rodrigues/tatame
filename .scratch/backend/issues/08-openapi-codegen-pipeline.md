# OpenAPI spec + client codegen pipeline

Type: task
Status: open

## Question

Wire the contract pipeline decided in ticket 04 into the nx workspace: an nx target on `apps/api` that emits the OpenAPI 3.0.x document to `packages/api-contract/openapi.json` (committed); a CI freshness check that regenerates the spec and fails on diff; generation of `packages/api-client` (openapi-typescript + openapi-fetch) consumed by web and RN; and documented, repeatable generation commands for the Kotlin client (openapi-generator, generator `kotlin`, library `jvm-retrofit2`, kotlinx-serialization) and the Swift client (apple/swift-openapi-generator SPM plugin) inside their app trees. Include the client-compatibility policy across the 4 apps: how long old generated clients must keep working against `/v1` (additive-only changes on `/v1`; breaking = new versioned route per ticket 04).

## Context

- Decision source: `issues/04-api-contract-style.md`.
- Coordinates with the infra map (`.scratch/infra/`) which owns nx layout and CI — this ticket should not contradict its target conventions; if infra decisions are not yet made, keep the targets self-contained under the affected projects.
