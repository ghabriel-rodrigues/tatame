package br.com.tatame.feature.agenda.di

import br.com.tatame.core.agenda.AgendaRepository
import br.com.tatame.core.agenda.AgendaRepositoryImpl
import br.com.tatame.feature.agenda.AlunoCalendarViewModel
import br.com.tatame.feature.agenda.ProfessorCalendarViewModel
import br.com.tatame.feature.agenda.aluno.AlunoAgendaViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Agenda feature module (AGD.7/8; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen). The two calendar ViewModels are
 * thin persona bindings over the shared [br.com.tatame.feature.agenda.CalendarViewModel].
 */
val agendaFeatureModule = module {
    single<AgendaRepository> { AgendaRepositoryImpl(get(), get()) }
    viewModel { AlunoAgendaViewModel(get()) }
    viewModel { AlunoCalendarViewModel(get()) }
    viewModel { ProfessorCalendarViewModel(get()) }
}
