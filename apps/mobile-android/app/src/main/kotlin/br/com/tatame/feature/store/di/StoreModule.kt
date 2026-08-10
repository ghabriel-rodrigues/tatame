package br.com.tatame.feature.store.di

import br.com.tatame.core.store.StoreRepository
import br.com.tatame.core.store.StoreRepositoryImpl
import br.com.tatame.feature.store.detail.StoreProductDetailViewModel
import br.com.tatame.feature.store.pedidos.MeusPedidosViewModel
import br.com.tatame.feature.store.vitrine.StoreVitrineViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Store feature module (STO.12/13; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen). [StoreProductDetailViewModel]
 * takes the product id as a runtime Koin parameter (one instance per opened
 * product). Purchase ViewModels get the billing repository too — settlement
 * rides the existing billing rails (spec 009: store never touches the
 * provider port).
 */
val storeFeatureModule = module {
    single<StoreRepository> { StoreRepositoryImpl(get(), get()) }
    viewModel { StoreVitrineViewModel(get()) }
    viewModel { (productId: String) -> StoreProductDetailViewModel(productId, get(), get()) }
    viewModel { MeusPedidosViewModel(get(), get()) }
}
