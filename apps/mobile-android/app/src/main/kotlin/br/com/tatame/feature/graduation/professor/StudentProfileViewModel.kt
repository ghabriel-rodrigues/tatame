package br.com.tatame.feature.graduation.professor

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.graduation.GraduationRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.StudentProfileResponse
import br.com.tatame.core.network.dto.ValidGraduation
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toGraduationMessageRes
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The professor "atualizar graduações" permission toggle key (spec 005). */
const val GRADUATION_UPDATE_PERMISSION = "graduation.update"

/** Perfil do aluno load state (GRD.20, professor-11). */
sealed interface StudentProfileState {
    data object Loading : StudentProfileState
    data class Error(@param:StringRes val messageRes: Int) : StudentProfileState
    data class Loaded(val profile: StudentProfileResponse) : StudentProfileState
}

/** The two award kinds behind Adicionar grau / Promover faixa. */
enum class AwardAction { ADD_DEGREE, PROMOTE_BELT }

/**
 * Confirmation dialog state — `nextDegree` set for ADD_DEGREE, `targetBelt`
 * for PROMOTE_BELT (the next enabled belt in the merged régua).
 */
data class AwardDialogState(
    val action: AwardAction,
    val nextDegree: Int? = null,
    val targetBelt: ValidGraduation? = null,
    val notes: String = "",
    val submitting: Boolean = false,
    @param:StringRes val errorRes: Int? = null,
)

data class StudentProfileUiState(
    val profile: StudentProfileState = StudentProfileState.Loading,
    /** Merged régua from GET /professor/profile — the Promover faixa target source. */
    val validGraduations: List<ValidGraduation> = emptyList(),
    val awardDialog: AwardDialogState? = null,
    val noteInput: String = "",
    val savingNote: Boolean = false,
    @param:StringRes val noteErrorRes: Int? = null,
    /** `graduation.update` toggle — actions hidden entirely when off (story 15). */
    val canUpdateGraduations: Boolean = true,
) {
    private val belt = (profile as? StudentProfileState.Loaded)?.profile?.belt

    /** Story 14: Adicionar grau blocked at the belt's maximum degrees. */
    val canAddDegree: Boolean
        get() = belt != null && belt.maxDegrees > 0 && belt.degrees < belt.maxDegrees

    /** Promote needs a known current belt with an enabled successor in the régua. */
    val promoteTarget: ValidGraduation?
        get() = belt?.let { GraduationFormat.nextEnabledBelt(validGraduations, it.beltId) }
}

/**
 * Professor perfil do aluno (GRD.20, professor-11): profile + merged régua
 * loaded together; Adicionar grau / Promover faixa as confirm-dialog flows
 * (optional observação attached to the award, story 13) hitting
 * POST /professor/students/:id/graduations; persistent observações via the
 * notes endpoints. A successful award refetches the profile so the derived
 * belt, progress anchor, and timeline-fed tiles all stay server-truth.
 */
class StudentProfileViewModel(
    private val studentId: String,
    canUpdateGraduations: Boolean,
    private val repository: GraduationRepository,
) : ViewModel() {

    private val _uiState =
        MutableStateFlow(StudentProfileUiState(canUpdateGraduations = canUpdateGraduations))
    val uiState: StateFlow<StudentProfileUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(profile = StudentProfileState.Loading) }
        viewModelScope.launch {
            // Régua and profile in parallel; the régua failing only disables
            // Promover faixa (no target guessing), never the whole screen.
            val reguaDeferred = async { repository.professorProfile() }
            val profileResult = repository.studentProfile(studentId)
            val reguaResult = reguaDeferred.await()
            _uiState.update {
                it.copy(
                    profile = when (profileResult) {
                        is ApiResult.Success -> StudentProfileState.Loaded(profileResult.value)
                        is ApiResult.Failure ->
                            StudentProfileState.Error(profileResult.error.toGraduationMessageRes())
                    },
                    validGraduations = when (reguaResult) {
                        is ApiResult.Success -> reguaResult.value.validGraduations
                        is ApiResult.Failure -> it.validGraduations
                    },
                )
            }
        }
    }

    // ---- award flows (Adicionar grau / Promover faixa) -------------------

    fun requestAddDegree() {
        val state = _uiState.value
        val belt = (state.profile as? StudentProfileState.Loaded)?.profile?.belt ?: return
        if (!state.canUpdateGraduations || !state.canAddDegree) return
        _uiState.update {
            it.copy(
                awardDialog = AwardDialogState(
                    action = AwardAction.ADD_DEGREE,
                    nextDegree = belt.degrees + 1,
                ),
            )
        }
    }

    fun requestPromoteBelt() {
        val state = _uiState.value
        if (!state.canUpdateGraduations) return
        val target = state.promoteTarget ?: return
        _uiState.update {
            it.copy(
                awardDialog = AwardDialogState(
                    action = AwardAction.PROMOTE_BELT,
                    targetBelt = target,
                ),
            )
        }
    }

    fun updateAwardNotes(notes: String) = _uiState.update {
        it.copy(awardDialog = it.awardDialog?.copy(notes = notes))
    }

    fun dismissAwardDialog() = _uiState.update {
        if (it.awardDialog?.submitting == true) it else it.copy(awardDialog = null)
    }

    fun confirmAward() {
        val dialog = _uiState.value.awardDialog ?: return
        if (dialog.submitting) return
        _uiState.update {
            it.copy(awardDialog = dialog.copy(submitting = true, errorRes = null))
        }
        viewModelScope.launch {
            val notes = dialog.notes.trim().ifEmpty { null }
            val result = when (dialog.action) {
                AwardAction.ADD_DEGREE -> repository.addDegree(studentId, notes)
                AwardAction.PROMOTE_BELT -> {
                    val target = dialog.targetBelt
                    if (target == null) {
                        _uiState.update { it.copy(awardDialog = null) }
                        return@launch
                    }
                    repository.promoteBelt(studentId, target.beltId, notes)
                }
            }
            when (result) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(awardDialog = null) }
                    // Derived belt, progress anchor, and timeline changed — refetch.
                    refresh()
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        awardDialog = it.awardDialog?.copy(
                            submitting = false,
                            errorRes = result.error.toGraduationMessageRes(),
                        ),
                    )
                }
            }
        }
    }

    // ---- observações persistentes ----------------------------------------

    fun updateNoteInput(input: String) = _uiState.update {
        it.copy(noteInput = input, noteErrorRes = null)
    }

    fun saveNote() {
        val state = _uiState.value
        val body = state.noteInput.trim()
        if (body.isEmpty() || state.savingNote) return
        _uiState.update { it.copy(savingNote = true, noteErrorRes = null) }
        viewModelScope.launch {
            when (val result = repository.createNote(studentId, body)) {
                is ApiResult.Success -> _uiState.update { current ->
                    val loaded = current.profile as? StudentProfileState.Loaded
                    current.copy(
                        savingNote = false,
                        noteInput = "",
                        profile = loaded?.let {
                            StudentProfileState.Loaded(
                                it.profile.copy(notes = listOf(result.value) + it.profile.notes),
                            )
                        } ?: current.profile,
                    )
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        savingNote = false,
                        noteErrorRes = result.error.toGraduationMessageRes(),
                    )
                }
            }
        }
    }
}
