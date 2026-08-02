# Testing strategy (Android)

Type: grilling
Blocked by: 01, 06

## Question

What is the Android testing pyramid: JVM unit tests (JUnit5 vs JUnit4 constraints on Android, MockK, coroutine/flow testing with Turbine), Compose UI tests (`createComposeRule`, semantics-based assertions on the custom tab bar/sheets), Robolectric's role, and instrumented/E2E scope (Espresso/UIAutomator vs Maestro — shared with the RN app's E2E choice?). Decide what "tested" means for the README feature-parity checklist on Android (mandatory layers per mirrored feature slice), how the networking layer is tested (MockWebServer/Ktor MockEngine), and how DI-driven test doubles are wired given the DI choice.
