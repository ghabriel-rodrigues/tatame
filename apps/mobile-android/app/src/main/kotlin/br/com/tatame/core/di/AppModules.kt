package br.com.tatame.core.di

import org.koin.core.module.Module
import org.koin.dsl.module

/**
 * Flat list of all Koin modules (ticket mobile-android/06 conventions):
 * `appModules = coreModules + featureModules`, verified by a mandatory
 * JVM `verify()` unit test (KoinModulesTest).
 *
 * Scope conventions: `single` for stateless infra, `viewModel` for every
 * ViewModel, `factory` for per-use stateful helpers. No custom session scopes.
 */
val coreModule: Module = module {
    // Empty for now — networkModule (ticket 02) and sessionModule (ticket 04)
    // land here when those slices ship.
}

val appModules: List<Module> = listOf(coreModule)
