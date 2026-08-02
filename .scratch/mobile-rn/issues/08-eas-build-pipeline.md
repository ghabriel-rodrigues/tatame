# EAS build/submit pipeline

Type: task
Status: open
Blocked by: 01

## Question

Graduated from map fog after ticket 01 fixed SDK 57 + CNG/prebuild + pnpm-workspace layout. Define the EAS pipeline: `eas.json` build profiles (development/dev-client, preview/internal, production), monorepo specifics (run `eas` from `apps/mobile-rn`, root `pnpm-lock.yaml` detection), credentials management, submit flow to TestFlight/Play internal track, and whether EAS Update (OTA) enters v1. Consult `/Users/gupy/LLM_WIKI/raw/skills/expo/plugins/expo/skills/expo-deployment/` and `expo-cicd-workflows/`.
