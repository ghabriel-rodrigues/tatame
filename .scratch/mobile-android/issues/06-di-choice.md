# Dependency injection: Hilt vs Koin

Type: grilling
Blocked by: 01

## Question

Hilt or Koin (or manual DI) for the Android app? Weigh: compile-time safety vs startup/runtime resolution, KSP processing cost in the chosen AGP/Kotlin setup, Compose + ViewModel integration (`hiltViewModel()` vs `koinViewModel()`), multi-module scaling if the Gradle layout is modular, testability (test doubles, instrumented test overrides), and team/agent ergonomics for a parity-driven codebase. Pick one and define the module/scope conventions.
