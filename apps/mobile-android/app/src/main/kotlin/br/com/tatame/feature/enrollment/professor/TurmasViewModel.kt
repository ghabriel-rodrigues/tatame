package br.com.tatame.feature.enrollment.professor

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.R
import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.enrollment.EnrollmentRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ClassDetail
import br.com.tatame.core.network.dto.ClassListItem
import br.com.tatame.core.network.dto.RosterStudent
import br.com.tatame.feature.enrollment.toEnrollmentMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** "Minhas turmas" list state (ENR.21). */
sealed interface TurmasListState {
    data object Loading : TurmasListState
    data class Error(@param:StringRes val messageRes: Int) : TurmasListState
    data class Loaded(val classes: List<ClassListItem>) : TurmasListState
}

/** Turma detail overlay state — Hidden means the list is showing. */
sealed interface TurmaDetailState {
    data object Hidden : TurmaDetailState
    data object Loading : TurmaDetailState
    data class Error(@param:StringRes val messageRes: Int) : TurmaDetailState
    data class Loaded(val detail: ClassDetail) : TurmaDetailState
}

/** "Adicionar aluno" bottom sheet (ENR.22, professor-09). */
data class AddStudentSheetState(
    val visible: Boolean = false,
    val loading: Boolean = false,
    val candidates: List<RosterStudent> = emptyList(),
    val addingStudentId: String? = null,
    @param:StringRes val errorRes: Int? = null,
)

/** Remove-from-roster confirmation dialog. */
data class RemoveDialogState(
    val student: RosterStudent,
    val removing: Boolean = false,
)

data class TurmasUiState(
    val list: TurmasListState = TurmasListState.Loading,
    val detail: TurmaDetailState = TurmaDetailState.Hidden,
    val addSheet: AddStudentSheetState = AddStudentSheetState(),
    val removeDialog: RemoveDialogState? = null,
    /** Transient action failure (remove/roster refresh) surfaced as a notice. */
    @param:StringRes val actionErrorRes: Int? = null,
)

/**
 * Professor turmas state machine (ENR.21/22 + ATT.20/21): list → detail →
 * roster add/remove, plus the chamada entries. Occupancy and Lotada are
 * server-derived — every mutation refetches the detail instead of recomputing.
 *
 * "Adicionar aluno" candidates come from GET /v1/professor/students with the
 * `notEnrolledInClassId` filter (ATT.21 — closes the spec-003 API gap that
 * forced the other-rosters union workaround).
 */
class TurmasViewModel(
    private val repository: EnrollmentRepository,
    private val attendanceRepository: AttendanceRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TurmasUiState())
    val uiState: StateFlow<TurmasUiState> = _uiState.asStateFlow()

    private var openClassId: String? = null

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(list = TurmasListState.Loading) }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    list = when (val result = repository.professorClasses()) {
                        is ApiResult.Success -> TurmasListState.Loaded(result.value)
                        is ApiResult.Failure ->
                            TurmasListState.Error(result.error.toEnrollmentMessageRes())
                    },
                )
            }
        }
    }

    fun openTurma(classId: String) {
        openClassId = classId
        _uiState.update { it.copy(detail = TurmaDetailState.Loading) }
        viewModelScope.launch { loadDetail(classId) }
    }

    fun closeTurma() {
        openClassId = null
        _uiState.update {
            it.copy(detail = TurmaDetailState.Hidden, addSheet = AddStudentSheetState(), removeDialog = null)
        }
        refresh() // occupancy on the list may have changed while in detail
    }

    // ---- adicionar aluno (ENR.22) ---------------------------------------

    fun openAddSheet() {
        val classId = openClassId ?: return
        if (_uiState.value.detail !is TurmaDetailState.Loaded) return
        _uiState.update { it.copy(addSheet = AddStudentSheetState(visible = true, loading = true)) }
        viewModelScope.launch {
            val result = attendanceRepository.students(notEnrolledInClassId = classId)
            _uiState.update { state ->
                if (!state.addSheet.visible) return@update state // dismissed mid-flight
                when (result) {
                    is ApiResult.Success -> state.copy(
                        addSheet = state.addSheet.copy(
                            loading = false,
                            candidates = result.value
                                .map { candidate ->
                                    RosterStudent(
                                        studentId = candidate.id,
                                        fullName = candidate.fullName,
                                        birthDate = candidate.birthDate,
                                        badge = candidate.badge,
                                    )
                                }
                                .sortedBy { it.fullName },
                        ),
                    )
                    is ApiResult.Failure -> state.copy(
                        addSheet = state.addSheet.copy(
                            loading = false,
                            errorRes = R.string.add_student_error,
                        ),
                    )
                }
            }
        }
    }

    fun dismissAddSheet() = _uiState.update { it.copy(addSheet = AddStudentSheetState()) }

    fun addStudent(studentId: String) {
        val classId = openClassId ?: return
        val sheet = _uiState.value.addSheet
        if (!sheet.visible || sheet.addingStudentId != null) return
        _uiState.update {
            it.copy(addSheet = it.addSheet.copy(addingStudentId = studentId, errorRes = null))
        }
        viewModelScope.launch {
            when (val result = repository.addStudent(classId, studentId)) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            addSheet = state.addSheet.copy(
                                addingStudentId = null,
                                candidates = state.addSheet.candidates
                                    .filterNot { it.studentId == studentId },
                            ),
                        )
                    }
                    loadDetail(classId)
                }
                is ApiResult.Failure -> _uiState.update { state ->
                    state.copy(
                        addSheet = state.addSheet.copy(
                            addingStudentId = null,
                            errorRes = result.error.toEnrollmentMessageRes(),
                        ),
                    )
                }
            }
        }
    }

    // ---- remover aluno (ENR.22) -----------------------------------------

    fun requestRemove(student: RosterStudent) =
        _uiState.update { it.copy(removeDialog = RemoveDialogState(student)) }

    fun dismissRemove() = _uiState.update { it.copy(removeDialog = null) }

    fun confirmRemove() {
        val classId = openClassId ?: return
        val dialog = _uiState.value.removeDialog ?: return
        if (dialog.removing) return
        _uiState.update { it.copy(removeDialog = dialog.copy(removing = true)) }
        viewModelScope.launch {
            when (val result = repository.removeStudent(classId, dialog.student.studentId)) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(removeDialog = null) }
                    loadDetail(classId)
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        removeDialog = null,
                        actionErrorRes = result.error.toEnrollmentMessageRes(),
                    )
                }
            }
        }
    }

    fun dismissActionError() = _uiState.update { it.copy(actionErrorRes = null) }

    private suspend fun loadDetail(classId: String) {
        if (openClassId != classId) return
        val result = repository.professorClassDetail(classId)
        if (openClassId != classId) return // navigated away mid-flight
        _uiState.update {
            it.copy(
                detail = when (result) {
                    is ApiResult.Success -> TurmaDetailState.Loaded(result.value)
                    is ApiResult.Failure -> TurmaDetailState.Error(result.error.toEnrollmentMessageRes())
                },
            )
        }
    }
}
