package br.com.tatame.feature.profile.di

import br.com.tatame.core.profile.ProfileRepository
import br.com.tatame.core.profile.ProfileRepositoryImpl
import br.com.tatame.feature.profile.DadosPessoaisViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Profile feature module (REP.13; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen).
 */
val profileFeatureModule = module {
    single<ProfileRepository> { ProfileRepositoryImpl(get(), get()) }
    viewModel { DadosPessoaisViewModel(get()) }
}
