# CI pipeline choice

Type: research
Blocked by: 01

## Question

Which CI platform and pipeline shape should the monorepo use? Research GitHub Actions (a `.github/` directory already exists in the repo) vs alternatives in the nx context: nx-affected-based pipelines (lint, typecheck, unit, e2e with a Postgres service container), remote caching options (Nx Cloud yes/no), pipeline layout (single workflow with affected targets vs per-app workflows), and how the pipeline stays fast as web + 3 mobile apps accumulate. Recommend the platform and the initial workflow set for the API-first phase.
