package br.com.tatame.feature.agenda.aluno

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.feature.agenda.AgendaFormat
import br.com.tatame.testutil.FakeAgendaRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.agendaClass
import br.com.tatame.testutil.agendaResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** AGD.7 — aluno Agenda pills + day fetch + check-in affordance (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class AlunoAgendaViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun harness(
        response: ApiResult<br.com.tatame.core.network.dto.AlunoAgendaResponse> =
            ApiResult.Success(agendaResponse(weekday = 3, isToday = true)),
        localToday: Int = 3,
    ): Pair<FakeAgendaRepository, AlunoAgendaViewModel> {
        val repository = FakeAgendaRepository()
        repository.agendaResult = response
        return repository to AlunoAgendaViewModel(repository, localTodayWeekday = localToday)
    }

    // ---- default day (today) ---------------------------------------------

    @Test
    fun `first fetch omits the weekday so the server answers tenant today`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        assertEquals(listOf<Int?>(null), repository.agendaCalls)
        assertEquals(3, viewModel.uiState.value.selectedWeekday)
        val day = viewModel.uiState.value.day as AgendaDayState.Loaded
        assertTrue(day.agenda.isToday)
    }

    @Test
    fun `pill highlight syncs to the server weekday when timezones disagree`() = runTest {
        // Device says Wednesday(3); tenant timezone is already Thursday(4).
        val (_, viewModel) = harness(
            response = ApiResult.Success(agendaResponse(weekday = 4, isToday = true)),
            localToday = 3,
        )
        assertEquals(3, viewModel.uiState.value.selectedWeekday) // pre-highlight
        advanceUntilIdle()

        assertEquals(4, viewModel.uiState.value.selectedWeekday) // server truth
    }

    // ---- pill selection --------------------------------------------------

    @Test
    fun `selecting a pill fetches that weekday`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        repository.agendaResult = ApiResult.Success(agendaResponse(weekday = 6, isToday = false))

        viewModel.selectWeekday(6)
        assertEquals(6, viewModel.uiState.value.selectedWeekday)
        assertTrue(viewModel.uiState.value.day is AgendaDayState.Loading)
        advanceUntilIdle()

        assertEquals(listOf<Int?>(null, 6), repository.agendaCalls)
        val day = viewModel.uiState.value.day as AgendaDayState.Loaded
        assertFalse(day.agenda.isToday)
    }

    // ---- check-in affordance states (spec 007 stories 6–9) ---------------

    @Test
    fun `today rows expose the button state until checked in`() = runTest {
        val (_, viewModel) = harness(
            response = ApiResult.Success(
                agendaResponse(
                    weekday = 3,
                    isToday = true,
                    classes = listOf(
                        agendaClass(classId = "c1", checkedIn = false),
                        agendaClass(classId = "c2", startTime = "20:00", checkedIn = true),
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        val agenda = (viewModel.uiState.value.day as AgendaDayState.Loaded).agenda
        val byId = agenda.classes.associateBy { it.classId }
        assertTrue(AgendaFormat.showCheckinButton(agenda.isToday, byId["c1"]!!.checkedIn))
        assertFalse(AgendaFormat.showCheckinButton(agenda.isToday, byId["c2"]!!.checkedIn)) // green check
    }

    @Test
    fun `off-today rows expose no affordance at all`() = runTest {
        val (_, viewModel) = harness(
            response = ApiResult.Success(
                agendaResponse(weekday = 5, isToday = false, classes = listOf(agendaClass())),
            ),
        )
        advanceUntilIdle()

        val agenda = (viewModel.uiState.value.day as AgendaDayState.Loaded).agenda
        assertFalse(AgendaFormat.showCheckinButton(agenda.isToday, agenda.classes.single().checkedIn))
    }

    @Test
    fun `a landed check-in refetches the same day`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.selectWeekday(3)
        advanceUntilIdle()
        repository.agendaResult = ApiResult.Success(
            agendaResponse(weekday = 3, isToday = true, classes = listOf(agendaClass(checkedIn = true))),
        )

        viewModel.refreshAfterCheckin()
        advanceUntilIdle()

        assertEquals(listOf<Int?>(null, 3, 3), repository.agendaCalls)
        val agenda = (viewModel.uiState.value.day as AgendaDayState.Loaded).agenda
        assertTrue(agenda.classes.single().checkedIn) // row flips to the green check
    }

    // ---- empty + error ---------------------------------------------------

    @Test
    fun `an empty weekday loads with no classes and empty events`() = runTest {
        val (_, viewModel) = harness(
            response = ApiResult.Success(
                agendaResponse(weekday = 0, isToday = false, classes = emptyList()),
            ),
        )
        advanceUntilIdle()

        val agenda = (viewModel.uiState.value.day as AgendaDayState.Loaded).agenda
        assertTrue(agenda.classes.isEmpty()) // renders "Sem aulas neste dia"
        assertTrue(agenda.events.isEmpty()) // "Eventos do mês" stays honestly empty
    }

    @Test
    fun `failures surface mapped PT-BR copy and retry refetches`() = runTest {
        val (repository, viewModel) = harness(response = ApiResult.Failure(ApiError.Network))
        advanceUntilIdle()

        assertEquals(
            AgendaDayState.Error(R.string.error_network),
            viewModel.uiState.value.day,
        )

        repository.agendaResult = ApiResult.Success(agendaResponse(weekday = 3, isToday = true))
        viewModel.retry()
        advanceUntilIdle()

        assertEquals(listOf<Int?>(null, null), repository.agendaCalls) // still server-default day
        assertTrue(viewModel.uiState.value.day is AgendaDayState.Loaded)
    }
}
