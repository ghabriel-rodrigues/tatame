package br.com.tatame.feature.enrollment.responsavel

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.R
import br.com.tatame.core.enrollment.EnrollmentRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ClassSuggestion
import br.com.tatame.core.network.dto.DependentDetail
import br.com.tatame.feature.enrollment.ScheduleFormat
import br.com.tatame.feature.enrollment.toEnrollmentMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Dependents panel state (ENR.22, responsavel-02). */
sealed interface DependentsListState {
    data object Loading : DependentsListState
    data class Error(@param:StringRes val messageRes: Int) : DependentsListState
    data class Loaded(val dependents: List<DependentDetail>) : DependentsListState
}

/** Dependent detail overlay — Hidden means the panel is showing. */
sealed interface DependentDetailState {
    data object Hidden : DependentDetailState
    data object Loading : DependentDetailState
    data class Error(@param:StringRes val messageRes: Int) : DependentDetailState
    data class Loaded(val dependent: DependentDetail) : DependentDetailState
}

/** Age-suggested class chip state (ENR.23) — fetched only after a full valid birth date. */
sealed interface SuggestionState {
    /** No complete birth date typed yet — nothing fetched. */
    data object Idle : SuggestionState
    data object Loading : SuggestionState
    /** Server answered: no age-matching class with a free slot. */
    data object None : SuggestionState
    data class Found(val suggestion: ClassSuggestion, val accepted: Boolean = true) : SuggestionState
}

/** "Cadastrar aluno" sheet state (responsavel-08). */
data class RegisterSheetState(
    val visible: Boolean = false,
    val fullName: String = "",
    val birthDateInput: String = "", // dd/MM/yyyy as typed
    val suggestion: SuggestionState = SuggestionState.Idle,
    val submitting: Boolean = false,
    @param:StringRes val errorRes: Int? = null,
)

/** Post-registration notice (story 33/34: auto-enrollment vs. full class). */
data class RegisterSuccess(val dependentName: String, val enrolled: Boolean)

data class DependentsUiState(
    val list: DependentsListState = DependentsListState.Loading,
    val detail: DependentDetailState = DependentDetailState.Hidden,
    val sheet: RegisterSheetState = RegisterSheetState(),
    /** `dependents.register` permission toggle from /auth/me — hides the CTA when off. */
    val canRegister: Boolean = true,
    val success: RegisterSuccess? = null,
)

/** Permission key gating child registration (mirror of the backend registry). */
const val DEPENDENTS_REGISTER_PERMISSION = "dependents.register"

/**
 * Responsável dependents state machine (ENR.22/23): panel → child detail,
 * plus the cadastrar-aluno sheet with server-side age suggestion. The
 * suggestion endpoint is queried only once the birth date is complete and
 * valid; editing the date resets the chip (never a stale suggestion).
 */
class DependentsViewModel(
    private val repository: EnrollmentRepository,
    canRegisterDependents: Boolean,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DependentsUiState(canRegister = canRegisterDependents))
    val uiState: StateFlow<DependentsUiState> = _uiState.asStateFlow()

    private var openDependentId: String? = null

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(list = DependentsListState.Loading) }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    list = when (val result = repository.dependents()) {
                        is ApiResult.Success -> DependentsListState.Loaded(result.value)
                        is ApiResult.Failure ->
                            DependentsListState.Error(result.error.toEnrollmentMessageRes())
                    },
                )
            }
        }
    }

    // ---- detail ---------------------------------------------------------

    fun openDependent(dependentId: String) {
        openDependentId = dependentId
        _uiState.update { it.copy(detail = DependentDetailState.Loading) }
        viewModelScope.launch {
            val result = repository.dependent(dependentId)
            if (openDependentId != dependentId) return@launch
            _uiState.update {
                it.copy(
                    detail = when (result) {
                        is ApiResult.Success -> DependentDetailState.Loaded(result.value)
                        is ApiResult.Failure ->
                            DependentDetailState.Error(result.error.toEnrollmentMessageRes())
                    },
                )
            }
        }
    }

    fun closeDependent() {
        openDependentId = null
        _uiState.update { it.copy(detail = DependentDetailState.Hidden) }
    }

    // ---- cadastrar aluno (ENR.23) ---------------------------------------

    fun openRegisterSheet() {
        if (!_uiState.value.canRegister) return // toggle off ⇒ action hidden AND inert
        _uiState.update { it.copy(sheet = RegisterSheetState(visible = true), success = null) }
    }

    fun dismissRegisterSheet() = _uiState.update { it.copy(sheet = RegisterSheetState()) }

    fun onFullNameChange(value: String) =
        _uiState.update { it.copy(sheet = it.sheet.copy(fullName = value, errorRes = null)) }

    fun onBirthDateChange(value: String) {
        val filtered = value.filter { it.isDigit() || it == '/' }.take(10)
        _uiState.update {
            it.copy(
                sheet = it.sheet.copy(
                    birthDateInput = filtered,
                    suggestion = SuggestionState.Idle, // date changed ⇒ stale chip dies
                    errorRes = null,
                ),
            )
        }
        val isoDate = ScheduleFormat.parseBrDate(filtered) ?: return
        _uiState.update { it.copy(sheet = it.sheet.copy(suggestion = SuggestionState.Loading)) }
        viewModelScope.launch {
            val result = repository.classSuggestion(isoDate)
            _uiState.update { state ->
                // input changed (or sheet closed) mid-flight ⇒ drop the answer
                if (!state.sheet.visible || state.sheet.birthDateInput != filtered) return@update state
                state.copy(
                    sheet = state.sheet.copy(
                        suggestion = when (result) {
                            is ApiResult.Success ->
                                result.value?.let { SuggestionState.Found(it) } ?: SuggestionState.None
                            // Suggestion is best-effort; registration proceeds without it.
                            is ApiResult.Failure -> SuggestionState.None
                        },
                    ),
                )
            }
        }
    }

    fun toggleSuggestionAccepted() = _uiState.update { state ->
        val found = state.sheet.suggestion as? SuggestionState.Found ?: return@update state
        state.copy(sheet = state.sheet.copy(suggestion = found.copy(accepted = !found.accepted)))
    }

    fun register() {
        val state = _uiState.value
        if (!state.canRegister || !state.sheet.visible || state.sheet.submitting) return
        val fullName = state.sheet.fullName.trim()
        val isoDate = ScheduleFormat.parseBrDate(state.sheet.birthDateInput)
        if (fullName.isBlank() || isoDate == null) {
            _uiState.update { it.copy(sheet = it.sheet.copy(errorRes = R.string.register_validation)) }
            return
        }
        val classId = (state.sheet.suggestion as? SuggestionState.Found)
            ?.takeIf { it.accepted }
            ?.suggestion?.id
        _uiState.update { it.copy(sheet = it.sheet.copy(submitting = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = repository.registerDependent(fullName, isoDate, classId)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            sheet = RegisterSheetState(),
                            success = RegisterSuccess(
                                dependentName = result.value.dependent.fullName,
                                enrolled = result.value.enrolled,
                            ),
                        )
                    }
                    refresh()
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        sheet = it.sheet.copy(
                            submitting = false,
                            errorRes = result.error.toEnrollmentMessageRes(),
                        ),
                    )
                }
            }
        }
    }

    fun dismissSuccess() = _uiState.update { it.copy(success = null) }
}
