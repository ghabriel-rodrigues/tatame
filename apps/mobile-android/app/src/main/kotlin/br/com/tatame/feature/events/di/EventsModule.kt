package br.com.tatame.feature.events.di

import br.com.tatame.core.events.EventsRepository
import br.com.tatame.core.events.EventsRepositoryImpl
import br.com.tatame.feature.events.aluno.EventDetailViewModel
import br.com.tatame.feature.events.responsavel.EventosViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Events feature module (EVT.12/13; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen). [EventDetailViewModel] takes the
 * event id as a runtime Koin parameter (one instance per opened event).
 * Payment ViewModels get the billing repository too — the paid flow rides
 * the existing billing rails (spec 008).
 */
val eventsFeatureModule = module {
    single<EventsRepository> { EventsRepositoryImpl(get(), get()) }
    viewModel { (eventId: String) -> EventDetailViewModel(eventId, get(), get()) }
    viewModel { EventosViewModel(get(), get()) }
}
