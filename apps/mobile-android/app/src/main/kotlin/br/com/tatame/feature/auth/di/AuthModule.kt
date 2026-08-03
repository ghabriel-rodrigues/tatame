package br.com.tatame.feature.auth.di

import br.com.tatame.feature.auth.LoginViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/** Auth feature module (ticket 06: each feature owns its ViewModels). */
val authFeatureModule = module {
    viewModel { LoginViewModel(get()) }
}
