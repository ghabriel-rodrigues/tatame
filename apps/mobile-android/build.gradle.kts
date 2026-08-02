// Root build file — plugin aliases only, applied per-module.
// AGP 9 has built-in Kotlin: org.jetbrains.kotlin.android is banned everywhere
// (module, root, catalog) per ticket mobile-android/01.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ksp) apply false
}
