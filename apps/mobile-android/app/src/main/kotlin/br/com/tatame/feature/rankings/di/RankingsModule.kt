package br.com.tatame.feature.rankings.di

import br.com.tatame.core.rankings.RankingsRepository
import br.com.tatame.core.rankings.RankingsRepositoryImpl
import br.com.tatame.feature.rankings.RankingViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Rankings feature module (REP.14; ticket 06 conventions). One ViewModel
 * class serves the home card, the dashboard section and the full screen —
 * the activity-scoped instance keeps the Por aulas read shared.
 */
val rankingsFeatureModule = module {
    single<RankingsRepository> { RankingsRepositoryImpl(get(), get()) }
    viewModel { RankingViewModel(get()) }
}
