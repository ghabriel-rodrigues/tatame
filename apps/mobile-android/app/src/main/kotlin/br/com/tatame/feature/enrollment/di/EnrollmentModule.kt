package br.com.tatame.feature.enrollment.di

import br.com.tatame.core.enrollment.EnrollmentRepository
import br.com.tatame.core.enrollment.EnrollmentRepositoryImpl
import br.com.tatame.feature.enrollment.professor.TurmasViewModel
import br.com.tatame.feature.enrollment.responsavel.DependentsViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Enrollment feature module (ENR.21–23; ticket 06 conventions: `single` for
 * the stateless repository, `viewModel` per screen). [DependentsViewModel]
 * takes the `dependents.register` toggle from /auth/me as a runtime parameter.
 */
val enrollmentFeatureModule = module {
    single<EnrollmentRepository> { EnrollmentRepositoryImpl(get(), get()) }
    // ATT.21 — the Adicionar aluno picker reads GET /professor/students
    // through the attendance repository (second dependency).
    viewModel { TurmasViewModel(get(), get()) }
    viewModel { params -> DependentsViewModel(get(), canRegisterDependents = params.get()) }
}
