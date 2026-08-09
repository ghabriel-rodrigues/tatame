package br.com.tatame.feature.billing.di

import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.billing.BillingRepositoryImpl
import br.com.tatame.feature.billing.aluno.CarteiraViewModel
import br.com.tatame.feature.billing.responsavel.PagamentosViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Billing feature module (BIL.19–21; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen).
 */
val billingFeatureModule = module {
    single<BillingRepository> { BillingRepositoryImpl(get(), get()) }
    viewModel { CarteiraViewModel(get()) }
    viewModel { PagamentosViewModel(get()) }
}
