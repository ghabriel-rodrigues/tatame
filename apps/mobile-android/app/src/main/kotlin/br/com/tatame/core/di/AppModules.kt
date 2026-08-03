package br.com.tatame.core.di

import br.com.tatame.feature.auth.di.authFeatureModule
import org.koin.core.module.Module

/**
 * Flat list of all Koin modules (ticket mobile-android/06 conventions):
 * `appModules = coreModules + featureModules`, verified by a mandatory
 * JVM `verify()` unit test (KoinModulesTest).
 *
 * Scope conventions: `single` for stateless infra, `viewModel` for every
 * ViewModel, `factory` for per-use stateful helpers. No custom session scopes.
 */
val coreModules: List<Module> = listOf(networkModule, sessionModule)

val featureModules: List<Module> = listOf(authFeatureModule)

val appModules: List<Module> = coreModules + featureModules
