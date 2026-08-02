# Expo setup under the nx monorepo

Type: research

## Question

How should the Expo app be created and wired inside the nx + pnpm monorepo at `apps/mobile-rn`? Compare `@nx/expo` (generator, executors, graph integration, maintenance status) vs a standalone Expo app registered as a plain pnpm workspace package. Cover the known pnpm quirks with Expo/React Native (hoisting, `node_modules` layout, `node-linker` settings, Metro resolution of workspace packages and symlinks), which Expo SDK version to pin, prebuild/CNG vs bare workflow, and how Metro must be configured to resolve the shared design-system package. Recommend one setup and document the exact scaffold steps.
