package br.com.tatame.feature.agenda.aluno

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.agenda.AgendaRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoAgendaResponse
import br.com.tatame.feature.agenda.CalendarGrid
import br.com.tatame.feature.agenda.toAgendaMessageRes
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Selected-day load state (AGD.7, aluno-11). */
sealed interface AgendaDayState {
    data object Loading : AgendaDayState
    data class Error(@param:StringRes val messageRes: Int) : AgendaDayState
    data class Loaded(val agenda: AlunoAgendaResponse) : AgendaDayState
}

data class AlunoAgendaUiState(
    /** Highlighted day pill (0 = Sunday … 6 = Saturday). */
    val selectedWeekday: Int,
    val day: AgendaDayState = AgendaDayState.Loading,
)

/**
 * Aluno Agenda tab (AGD.7): seven day pills over GET /v1/aluno/agenda.
 * The first fetch omits `weekday` so the server answers for *tenant-timezone*
 * today (spec 007 story 32) and the pill syncs to the returned `weekday`;
 * [localTodayWeekday] only pre-highlights the pill until that truth arrives.
 * The check-in affordance is data-driven (`isToday && !checkedIn`) and a
 * landed check-in refetches the day ([refreshAfterCheckin], story 7).
 */
class AlunoAgendaViewModel(
    private val repository: AgendaRepository,
    localTodayWeekday: Int = CalendarGrid.apiWeekday(LocalDate.now()),
) : ViewModel() {

    /** Null until the aluno taps a pill — the server keeps choosing today. */
    private var explicitWeekday: Int? = null

    private val _uiState = MutableStateFlow(AlunoAgendaUiState(selectedWeekday = localTodayWeekday))
    val uiState: StateFlow<AlunoAgendaUiState> = _uiState.asStateFlow()

    init {
        fetch()
    }

    fun selectWeekday(weekday: Int) {
        explicitWeekday = weekday
        _uiState.update { it.copy(selectedWeekday = weekday) }
        fetch()
    }

    fun retry() = fetch()

    /** Called when the shared check-in sheet lands a result (spec 007 story 7). */
    fun refreshAfterCheckin() = fetch()

    private fun fetch() {
        _uiState.update { it.copy(day = AgendaDayState.Loading) }
        viewModelScope.launch {
            when (val result = repository.alunoAgenda(explicitWeekday)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        selectedWeekday = result.value.weekday, // server truth (tenant timezone)
                        day = AgendaDayState.Loaded(result.value),
                    )
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(day = AgendaDayState.Error(result.error.toAgendaMessageRes()))
                }
            }
        }
    }
}
