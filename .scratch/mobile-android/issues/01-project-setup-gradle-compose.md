# Project setup: Gradle + Compose + Material3

Type: grilling

## Question

How is the Android project scaffolded at `apps/mobile-android` as a standalone Gradle project **outside the nx build graph**? Decide: AGP/Kotlin/Gradle versions (consult `kotlin-tooling-agp9-migration` "Pure Android Tips" first — built-in Kotlin, KSP over kapt), min/target SDK, Gradle module layout (single `:app` vs `:app` + feature/core modules), Compose + Material3 as the UI stack with Material3 theming skinned by Lumira tokens (what maps to `ColorScheme`/`Typography`/`Shapes` and what needs custom design-system composables), version catalog conventions, and — explicitly documented — how this Gradle world coexists with the nx/pnpm monorepo: git layout, `.gitignore`, what (if anything) nx knows about it, and how CI invokes the Gradle build.
