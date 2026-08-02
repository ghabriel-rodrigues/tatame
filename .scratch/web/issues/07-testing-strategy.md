# Web testing strategy

Type: grilling
Status: open
Blocked by: 01

## Question

What is the testing strategy for the web app? Decide: unit/component runner (Vitest + React Testing Library under nx — aligns with the Vite build decision); API mocking approach (MSW, ideally generated from the same OpenAPI spec as the client); what deserves component tests vs E2E (Playwright?) given BOSS's rule that a README checklist box only gets checked with working, tested code; how RBAC/persona boundaries are tested (professor must never see financial data); visual/design-fidelity checks against the pixel-perfect handoff (screenshot tests worth it or not); and where tests run (nx targets, CI on GitHub Actions vs Netlify build).
