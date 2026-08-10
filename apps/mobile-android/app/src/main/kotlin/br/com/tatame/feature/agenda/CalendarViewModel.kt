package br.com.tatame.feature.agenda

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.agenda.AgendaRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CalendarBuckets
import br.com.tatame.core.network.dto.CalendarEventItem
import br.com.tatame.core.network.dto.CalendarResponse
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Month-calendar load state (AGD.8, aluno-08 / professor-04). */
sealed interface CalendarState {
    data object Loading : CalendarState
    data class Error(@param:StringRes val messageRes: Int) : CalendarState
    data class Loaded(
        val month: YearMonth,
        val buckets: CalendarBuckets,
        /** The month's published events as dated items — pink dots (EVT.12/13). */
        val events: List<CalendarEventItem> = emptyList(),
    ) : CalendarState
}

data class CalendarUiState(
    val calendar: CalendarState = CalendarState.Loading,
    val selectedDate: LocalDate,
)

/**
 * Shared month-calendar state machine (AGD.8): one persona-scoped [load]
 * (the only difference between the aluno and professor screens), the current
 * month only (month paging is out of scope, spec 007), today preselected.
 * Dot expansion and day agendas are pure [CalendarGrid] derivations over the
 * loaded weekday buckets.
 */
open class CalendarViewModel(
    private val load: suspend () -> ApiResult<CalendarResponse>,
    today: LocalDate = LocalDate.now(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(CalendarUiState(selectedDate = today))
    val uiState: StateFlow<CalendarUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(calendar = CalendarState.Loading) }
        viewModelScope.launch {
            when (val result = load()) {
                is ApiResult.Success -> {
                    val month = CalendarGrid.parseMonth(result.value.month)
                        ?: YearMonth.from(_uiState.value.selectedDate)
                    _uiState.update {
                        it.copy(
                            calendar = CalendarState.Loaded(
                                month = month,
                                buckets = result.value.classesByWeekday,
                                events = result.value.events,
                            ),
                            // Keep today when it belongs to the served month;
                            // clamp to day 1 otherwise (tenant/device month skew).
                            selectedDate = if (YearMonth.from(it.selectedDate) == month) {
                                it.selectedDate
                            } else {
                                month.atDay(1)
                            },
                        )
                    }
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(calendar = CalendarState.Error(result.error.toAgendaMessageRes()))
                }
            }
        }
    }

    fun selectDay(date: LocalDate) = _uiState.update { it.copy(selectedDate = date) }
}

/** Aluno month calendar — enrolled-class recurrence ("sua aula"). */
class AlunoCalendarViewModel(repository: AgendaRepository) :
    CalendarViewModel(load = { repository.alunoCalendar() })

/** Professor month calendar — own-class recurrence ("aula recorrente"). */
class ProfessorCalendarViewModel(repository: AgendaRepository) :
    CalendarViewModel(load = { repository.professorCalendar() })
