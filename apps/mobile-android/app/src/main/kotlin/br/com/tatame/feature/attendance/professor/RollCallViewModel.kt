package br.com.tatame.feature.attendance.professor

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CheckinMethods
import br.com.tatame.core.network.dto.LiveSession
import br.com.tatame.feature.attendance.toAttendanceMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * One roster row of the manual chamada. `attendanceId` non-null = present
 * (toggled on); `manual` drives the visual marker; `recordedByProfessor`
 * distinguishes professor-recorded rows from self manual check-ins.
 */
data class RollCallRow(
    val studentId: String,
    val fullName: String,
    val attendanceId: String? = null,
    val manual: Boolean = false,
    val recordedByProfessor: Boolean = false,
    val pending: Boolean = false,
)

/** Chamada manual screen state (ATT.21, professor-10 active behavior). */
sealed interface RollCallState {
    data object Loading : RollCallState
    data class Error(@param:StringRes val messageRes: Int) : RollCallState
    data class Loaded(
        val session: LiveSession,
        val rows: List<RollCallRow>,
        val presentCount: Int,
        /** Transient action failure (e.g. revoke window closed) as a dismissible notice. */
        @param:StringRes val noticeRes: Int? = null,
    ) : RollCallState
}

/**
 * Manual roll-call state machine (ATT.21): open materializes the session and
 * returns the roster with self check-ins pre-toggled (one truth for both
 * chamada modes). Toggles apply immediately per tap — on = professor-recorded
 * manual INSERT, off = same-day revoke through the audited void seam;
 * "Salvar chamada" is pure navigation (spec story 32). Both duplicate
 * directions (`already_checked_in` / `already_revoked`) are benign.
 */
class RollCallViewModel(
    private val classId: String,
    private val repository: AttendanceRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<RollCallState>(RollCallState.Loading)
    val uiState: StateFlow<RollCallState> = _uiState.asStateFlow()

    init {
        open()
    }

    fun open() {
        _uiState.value = RollCallState.Loading
        viewModelScope.launch {
            _uiState.value = when (val result = repository.openRollCall(classId)) {
                is ApiResult.Success -> RollCallState.Loaded(
                    session = result.value.session,
                    presentCount = result.value.presentCount,
                    rows = result.value.roster.map { row ->
                        RollCallRow(
                            studentId = row.studentId,
                            fullName = row.fullName,
                            attendanceId = row.attendance?.id,
                            manual = row.attendance?.method == CheckinMethods.MANUAL,
                            recordedByProfessor = row.attendance?.recordedByUserId != null,
                        )
                    },
                )
                is ApiResult.Failure ->
                    RollCallState.Error(result.error.toAttendanceMessageRes())
            }
        }
    }

    /** Per-tap toggle — mark when absent, revoke when present (spec stories 28/29). */
    fun toggle(studentId: String) {
        val loaded = _uiState.value as? RollCallState.Loaded ?: return
        val row = loaded.rows.firstOrNull { it.studentId == studentId } ?: return
        if (row.pending) return
        val attendanceId = row.attendanceId
        if (attendanceId == null) mark(loaded.session.id, studentId) else revoke(studentId, attendanceId)
    }

    fun dismissNotice() = _uiState.update { state ->
        (state as? RollCallState.Loaded)?.copy(noticeRes = null) ?: state
    }

    private fun mark(sessionId: String, studentId: String) {
        setRow(studentId) { it.copy(pending = true) }
        viewModelScope.launch {
            when (val result = repository.markAttendance(sessionId, studentId)) {
                is ApiResult.Success -> _uiState.update { state ->
                    val loaded = state as? RollCallState.Loaded ?: return@update state
                    loaded.copy(
                        presentCount = result.value.presentCount,
                        rows = loaded.rows.map { row ->
                            if (row.studentId != studentId) row
                            else row.copy(
                                attendanceId = result.value.attendance.id,
                                manual = true,
                                recordedByProfessor = true,
                                pending = false,
                            )
                        },
                    )
                }
                is ApiResult.Failure -> failRow(studentId, result)
            }
        }
    }

    private fun revoke(studentId: String, attendanceId: String) {
        setRow(studentId) { it.copy(pending = true) }
        viewModelScope.launch {
            when (val result = repository.revokeAttendance(attendanceId)) {
                is ApiResult.Success -> _uiState.update { state ->
                    val loaded = state as? RollCallState.Loaded ?: return@update state
                    loaded.copy(
                        presentCount = result.value.presentCount,
                        rows = loaded.rows.map { row ->
                            if (row.studentId != studentId) row
                            else row.copy(
                                attendanceId = null,
                                manual = false,
                                recordedByProfessor = false,
                                pending = false,
                            )
                        },
                    )
                }
                is ApiResult.Failure -> failRow(studentId, result)
            }
        }
    }

    private fun failRow(studentId: String, result: ApiResult.Failure) {
        setRow(studentId) { it.copy(pending = false) }
        _uiState.update { state ->
            (state as? RollCallState.Loaded)
                ?.copy(noticeRes = result.error.toAttendanceMessageRes())
                ?: state
        }
    }

    private fun setRow(studentId: String, transform: (RollCallRow) -> RollCallRow) =
        _uiState.update { state ->
            val loaded = state as? RollCallState.Loaded ?: return@update state
            loaded.copy(
                rows = loaded.rows.map { if (it.studentId == studentId) transform(it) else it },
            )
        }
}
