package br.com.tatame.feature.agenda

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.testutil.FakeAgendaRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.calendarBuckets
import br.com.tatame.testutil.calendarEventItem
import br.com.tatame.testutil.calendarItem
import br.com.tatame.testutil.calendarResponse
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * AGD.8 — the shared calendar state machine over a fixed month (August 2026):
 * buckets→dots expansion, day selection, empty-day derivation, persona
 * bindings.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CalendarViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val today = LocalDate.of(2026, 8, 2) // Sunday — the prototype's selected day

    // Mon/Wed recurrence + a Saturday open mat.
    private val buckets = calendarBuckets(
        1 to listOf(
            calendarItem(classId = "c2", className = "Noite", startTime = "19:00"),
            calendarItem(classId = "c1", className = "Manhã", startTime = "07:00"),
        ),
        3 to listOf(calendarItem(classId = "c2", className = "Noite", startTime = "19:00")),
        6 to listOf(calendarItem(classId = "c3", className = "Open mat", startTime = "10:00")),
    )

    private fun harness(
        result: ApiResult<br.com.tatame.core.network.dto.CalendarResponse> =
            ApiResult.Success(calendarResponse(month = "2026-08", buckets = buckets)),
    ): CalendarViewModel = CalendarViewModel(load = { result }, today = today)

    // ---- load + dots -----------------------------------------------------

    @Test
    fun `loads the echoed month with today preselected and expands dots`() = runTest {
        val viewModel = harness()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        val loaded = state.calendar as CalendarState.Loaded
        assertEquals(YearMonth.of(2026, 8), loaded.month)
        assertEquals(today, state.selectedDate)

        val dots = CalendarGrid.classDotDates(loaded.buckets, loaded.month)
        assertEquals(14, dots.size) // 5 Mondays + 4 Wednesdays + 5 Saturdays
        assertTrue(LocalDate.of(2026, 8, 1) in dots) // first Saturday
        assertTrue(LocalDate.of(2026, 8, 31) in dots) // last Monday
        assertTrue(LocalDate.of(2026, 8, 2) !in dots) // Sundays stay clean
    }

    @Test
    fun `an unparseable month echo falls back to the month of today`() = runTest {
        val viewModel = harness(
            result = ApiResult.Success(calendarResponse(month = "not-a-month", buckets = buckets)),
        )
        advanceUntilIdle()

        val loaded = viewModel.uiState.value.calendar as CalendarState.Loaded
        assertEquals(YearMonth.of(2026, 8), loaded.month)
    }

    @Test
    fun `a month echo not containing today clamps the selection to day one`() = runTest {
        val viewModel = harness(
            result = ApiResult.Success(calendarResponse(month = "2026-09", buckets = buckets)),
        )
        advanceUntilIdle()

        assertEquals(LocalDate.of(2026, 9, 1), viewModel.uiState.value.selectedDate)
    }

    @Test
    fun `month events flow into the loaded state — pink dots and day entries`() = runTest {
        val viewModel = harness(
            result = ApiResult.Success(
                calendarResponse(
                    month = "2026-08",
                    buckets = buckets,
                    events = listOf(calendarEventItem(id = "ev1", date = "2026-08-15")),
                ),
            ),
        )
        advanceUntilIdle()

        val loaded = viewModel.uiState.value.calendar as CalendarState.Loaded
        assertEquals(1, loaded.events.size)
        assertTrue(CalendarGrid.hasEventDot(loaded.events, LocalDate.of(2026, 8, 15)))
        assertEquals(
            listOf("ev1"),
            CalendarGrid.dayEvents(loaded.events, LocalDate.of(2026, 8, 15)).map { it.id },
        )
        assertTrue(CalendarGrid.dayEvents(loaded.events, LocalDate.of(2026, 8, 16)).isEmpty())
    }

    // ---- day selection ---------------------------------------------------

    @Test
    fun `selecting a day surfaces its bucket sorted by time`() = runTest {
        val viewModel = harness()
        advanceUntilIdle()

        viewModel.selectDay(LocalDate.of(2026, 8, 3)) // a Monday

        val state = viewModel.uiState.value
        val loaded = state.calendar as CalendarState.Loaded
        assertEquals(LocalDate.of(2026, 8, 3), state.selectedDate)
        assertEquals(
            listOf("Manhã", "Noite"),
            CalendarGrid.dayItems(loaded.buckets, state.selectedDate).map { it.className },
        )
    }

    @Test
    fun `a free selected day derives an empty agenda for the persona copy`() = runTest {
        val viewModel = harness()
        advanceUntilIdle()

        viewModel.selectDay(LocalDate.of(2026, 8, 4)) // a Tuesday — no recurrence

        val loaded = viewModel.uiState.value.calendar as CalendarState.Loaded
        // Empty derivation is what renders "Dia livre — …" / "Nada agendado…".
        assertTrue(CalendarGrid.dayItems(loaded.buckets, LocalDate.of(2026, 8, 4)).isEmpty())
    }

    // ---- errors + persona bindings ---------------------------------------

    @Test
    fun `failures surface mapped PT-BR copy and refresh recovers`() = runTest {
        var result: ApiResult<br.com.tatame.core.network.dto.CalendarResponse> =
            ApiResult.Failure(ApiError.Timeout)
        val viewModel = CalendarViewModel(load = { result }, today = today)
        advanceUntilIdle()

        assertEquals(
            CalendarState.Error(R.string.error_timeout),
            viewModel.uiState.value.calendar,
        )

        result = ApiResult.Success(calendarResponse(month = "2026-08", buckets = buckets))
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.calendar is CalendarState.Loaded)
    }

    @Test
    fun `persona view models call their own persona endpoint`() = runTest {
        val repository = FakeAgendaRepository()
        repository.alunoCalendarResult =
            ApiResult.Success(calendarResponse(month = "2026-08", buckets = buckets))
        repository.professorCalendarResult =
            ApiResult.Success(calendarResponse(month = "2026-08", buckets = buckets))

        AlunoCalendarViewModel(repository)
        advanceUntilIdle()
        assertEquals(listOf<String?>(null), repository.alunoCalendarCalls)
        assertTrue(repository.professorCalendarCalls.isEmpty())

        ProfessorCalendarViewModel(repository)
        advanceUntilIdle()
        assertEquals(listOf<String?>(null), repository.professorCalendarCalls)
        assertEquals(1, repository.alunoCalendarCalls.size) // untouched
    }
}
