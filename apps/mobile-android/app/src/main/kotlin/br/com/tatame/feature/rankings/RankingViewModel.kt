package br.com.tatame.feature.rankings

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.RankingBys
import br.com.tatame.core.network.dto.RankingResponse
import br.com.tatame.core.rankings.RankingsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The two segments of the full ranking screen (Por aulas / Por eventos). */
enum class RankingSegment(val by: String) {
    LESSONS(RankingBys.LESSONS),
    EVENTS(RankingBys.EVENTS),
}

/** Per-segment load state. */
sealed interface RankingSegmentState {
    data object Loading : RankingSegmentState
    data class Error(@param:StringRes val messageRes: Int) : RankingSegmentState
    data class Loaded(val ranking: RankingResponse) : RankingSegmentState
}

/** `events` stays null until the segment is first selected (lazy semester read). */
data class RankingUiState(
    val segment: RankingSegment = RankingSegment.LESSONS,
    val lessons: RankingSegmentState = RankingSegmentState.Loading,
    val events: RankingSegmentState? = null,
)

/**
 * Rankings state (REP.14): the Por aulas segment loads eagerly — it also
 * feeds the aluno home "Ranking do mês" card (`me`) and the professor
 * dashboard top rows — Por eventos loads lazily on first selection. Both
 * personas share this ViewModel; `me` is server-null for professors.
 */
class RankingViewModel(private val repository: RankingsRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(RankingUiState())
    val uiState: StateFlow<RankingUiState> = _uiState.asStateFlow()

    init {
        load(RankingSegment.LESSONS)
    }

    fun selectSegment(segment: RankingSegment) {
        _uiState.update { it.copy(segment = segment) }
        if (segment == RankingSegment.EVENTS && _uiState.value.events == null) {
            load(RankingSegment.EVENTS)
        }
    }

    /** Reloads the selected segment (retry affordance). */
    fun refresh() = load(_uiState.value.segment)

    private fun load(segment: RankingSegment) {
        _uiState.update { it.withSegment(segment, RankingSegmentState.Loading) }
        viewModelScope.launch {
            val state = when (val result = repository.ranking(by = segment.by)) {
                is ApiResult.Success -> RankingSegmentState.Loaded(result.value)
                is ApiResult.Failure ->
                    RankingSegmentState.Error(result.error.toRankingMessageRes())
            }
            _uiState.update { it.withSegment(segment, state) }
        }
    }

    private fun RankingUiState.withSegment(
        segment: RankingSegment,
        state: RankingSegmentState,
    ): RankingUiState = when (segment) {
        RankingSegment.LESSONS -> copy(lessons = state)
        RankingSegment.EVENTS -> copy(events = state)
    }
}
