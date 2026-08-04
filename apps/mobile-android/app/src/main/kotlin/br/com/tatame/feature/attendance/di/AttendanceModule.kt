package br.com.tatame.feature.attendance.di

import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.attendance.AttendanceRepositoryImpl
import br.com.tatame.core.attendance.LiveStreamClient
import br.com.tatame.core.attendance.OkHttpLiveStreamClient
import br.com.tatame.feature.attendance.aluno.AlunoHomeViewModel
import br.com.tatame.feature.attendance.professor.LiveChamadaViewModel
import br.com.tatame.feature.attendance.professor.ProfessorDashboardViewModel
import br.com.tatame.feature.attendance.professor.RollCallViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

/**
 * Attendance feature module (ATT.19–21; ticket 06 conventions: `single` for
 * stateless infra, `viewModel` per screen). [LiveChamadaViewModel] and
 * [RollCallViewModel] take the turma id as a runtime parameter. The stream
 * client rides the authed OkHttp stack (read timeout removed internally for
 * the SSE heartbeat cadence).
 */
val attendanceFeatureModule = module {
    single<AttendanceRepository> { AttendanceRepositoryImpl(get(), get()) }
    single<LiveStreamClient> { OkHttpLiveStreamClient(get(), get(), get()) }
    viewModel { AlunoHomeViewModel(get()) }
    viewModel { params -> LiveChamadaViewModel(classId = params.get(), get(), get()) }
    viewModel { params -> RollCallViewModel(classId = params.get(), get()) }
    viewModel { ProfessorDashboardViewModel(get()) }
}
