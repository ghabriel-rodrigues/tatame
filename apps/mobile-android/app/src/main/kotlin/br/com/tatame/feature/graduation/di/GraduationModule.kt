package br.com.tatame.feature.graduation.di

import br.com.tatame.core.graduation.GraduationRepository
import br.com.tatame.core.graduation.GraduationRepositoryImpl
import br.com.tatame.feature.graduation.aluno.AlunoGraduacaoViewModel
import br.com.tatame.feature.graduation.professor.ProfessorProfileViewModel
import br.com.tatame.feature.graduation.professor.StudentProfileViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Graduation feature module (GRD.18–20; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen). [StudentProfileViewModel] takes
 * the student id and the `graduation.update` toggle as runtime parameters
 * (same convention as the chamada ViewModels).
 */
val graduationFeatureModule = module {
    single<GraduationRepository> { GraduationRepositoryImpl(get(), get()) }
    viewModel { AlunoGraduacaoViewModel(get()) }
    viewModel { params ->
        StudentProfileViewModel(
            studentId = params.get(),
            canUpdateGraduations = params.get(),
            repository = get(),
        )
    }
    viewModel { ProfessorProfileViewModel(get()) }
}
