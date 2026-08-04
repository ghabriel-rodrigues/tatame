package br.com.tatame.feature.attendance.professor

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ProfessorDashboardResponse
import br.com.tatame.feature.attendance.toAttendanceMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Professor Início state (ATT.20/21, professor-02). */
sealed interface DashboardState {
    data object Loading : DashboardState
    data class Error(@param:StringRes val messageRes: Int) : DashboardState
    data class Loaded(val dashboard: ProfessorDashboardResponse) : DashboardState
}

/**
 * Dashboard tiles from GET /v1/professor/dashboard: alunos hoje, presença
 * média, next-class hero with its live check-in count (the ranking /
 * graduação / pagamentos sections stay placeholders owned by later slices).
 * Refreshed on return from a chamada so hero counts stay honest.
 */
class ProfessorDashboardViewModel(private val repository: AttendanceRepository) : ViewModel() {

    private val _uiState = MutableStateFlow<DashboardState>(DashboardState.Loading)
    val uiState: StateFlow<DashboardState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { if (it is DashboardState.Loaded) it else DashboardState.Loading }
        viewModelScope.launch {
            _uiState.value = when (val result = repository.dashboard()) {
                is ApiResult.Success -> DashboardState.Loaded(result.value)
                is ApiResult.Failure -> DashboardState.Error(result.error.toAttendanceMessageRes())
            }
        }
    }
}
