package br.com.tatame.core.di

import br.com.tatame.feature.agenda.di.agendaFeatureModule
import br.com.tatame.feature.attendance.di.attendanceFeatureModule
import br.com.tatame.feature.auth.di.authFeatureModule
import br.com.tatame.feature.billing.di.billingFeatureModule
import br.com.tatame.feature.enrollment.di.enrollmentFeatureModule
import br.com.tatame.feature.events.di.eventsFeatureModule
import br.com.tatame.feature.graduation.di.graduationFeatureModule
import br.com.tatame.feature.store.di.storeFeatureModule
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

val featureModules: List<Module> = listOf(
    authFeatureModule,
    enrollmentFeatureModule,
    attendanceFeatureModule,
    graduationFeatureModule,
    billingFeatureModule,
    agendaFeatureModule,
    eventsFeatureModule,
    storeFeatureModule,
)

val appModules: List<Module> = coreModules + featureModules
