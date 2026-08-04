package br.com.tatame.feature.attendance.professor

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.core.network.dto.ProfessorNextClass
import br.com.tatame.core.network.dto.ProfessorTodayClass
import br.com.tatame.testutil.FakeAttendanceRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** ATT.20/21 — professor dashboard tiles mapping over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfessorDashboardViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `dashboard loads tiles hero and today classes`() = runTest {
        val repository = FakeAttendanceRepository()
        repository.dashboardResult = ApiResult.Success(
            ProfessorDashboardResponse(
                alunosHoje = 23,
                presencaMediaPct = 81.0,
                nextClass = ProfessorNextClass(
                    classId = "c1",
                    className = "Open mat",
                    slot = slot(startTime = "10:00", durationMinutes = 120),
                    checkedInCount = 18,
                ),
                todayClasses = listOf(
                    ProfessorTodayClass(
                        classId = "c1",
                        className = "Open mat",
                        slot = slot(startTime = "10:00", durationMinutes = 120),
                        checkedInCount = 18,
                        enrolledCount = 24,
                    ),
                ),
            ),
        )
        val viewModel = ProfessorDashboardViewModel(repository)
        advanceUntilIdle()

        val loaded = viewModel.uiState.value as DashboardState.Loaded
        assertEquals(23, loaded.dashboard.alunosHoje)
        assertEquals(81.0, loaded.dashboard.presencaMediaPct, 0.0)
        assertEquals(18, loaded.dashboard.nextClass?.checkedInCount)
        assertEquals(24, loaded.dashboard.todayClasses.single().enrolledCount)
    }

    @Test
    fun `dashboard without a next class keeps the hero empty state`() = runTest {
        val repository = FakeAttendanceRepository()
        repository.dashboardResult = ApiResult.Success(
            ProfessorDashboardResponse(alunosHoje = 0, presencaMediaPct = 0.0, nextClass = null),
        )
        val viewModel = ProfessorDashboardViewModel(repository)
        advanceUntilIdle()

        val loaded = viewModel.uiState.value as DashboardState.Loaded
        assertNull(loaded.dashboard.nextClass)
        assertTrue(loaded.dashboard.todayClasses.isEmpty())
    }

    @Test
    fun `dashboard failure surfaces mapped copy and refresh recovers`() = runTest {
        val repository = FakeAttendanceRepository()
        repository.dashboardResult = ApiResult.Failure(ApiError.Network)
        val viewModel = ProfessorDashboardViewModel(repository)
        advanceUntilIdle()

        assertEquals(DashboardState.Error(R.string.error_network), viewModel.uiState.value)

        repository.dashboardResult = ApiResult.Success(
            ProfessorDashboardResponse(alunosHoje = 5, presencaMediaPct = 50.0, nextClass = null),
        )
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(5, (viewModel.uiState.value as DashboardState.Loaded).dashboard.alunosHoje)
        assertEquals(2, repository.dashboardCalls)
    }
}
