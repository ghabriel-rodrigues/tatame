package br.com.tatame.feature.attendance.aluno

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoHomeResponse
import br.com.tatame.core.network.dto.CheckinResponse
import br.com.tatame.core.network.dto.CheckinStatus
import br.com.tatame.feature.attendance.toAttendanceMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Início load state (ATT.19, aluno-03). */
sealed interface AlunoHomeState {
    data object Loading : AlunoHomeState
    data class Error(@param:StringRes val messageRes: Int) : AlunoHomeState
    data class Loaded(val home: AlunoHomeResponse) : AlunoHomeState
}

/** The three methods of the check-in sheet's segmented control (aluno-04). */
enum class CheckinMethodTab { QR, CODE, MANUAL }

/** Check-in bottom sheet state — Hidden means not showing. */
data class CheckinSheetState(
    val visible: Boolean = false,
    val method: CheckinMethodTab = CheckinMethodTab.QR,
    val codeInput: String = "",
    val submitting: Boolean = false,
    @param:StringRes val errorRes: Int? = null,
)

/**
 * Success pop (aluno-05). `alreadyCheckedIn` renders the distinct
 * "Presença já registrada" state (spec story 9 — never an error, never a
 * duplicate row). `streak` null = gamification toggle off → line hidden.
 */
data class CheckinResultState(
    val alreadyCheckedIn: Boolean,
    val streak: Int?,
)

data class AlunoHomeUiState(
    val home: AlunoHomeState = AlunoHomeState.Loading,
    val sheet: CheckinSheetState = CheckinSheetState(),
    val result: CheckinResultState? = null,
)

/** 4-digit live code length (spec 004 — `checkin_codes.code`). */
const val LIVE_CODE_LENGTH = 4

/**
 * Aluno Início + check-in state machine (ATT.19): home tiles from
 * GET /v1/aluno/home, the 3-method sheet converging on POST /v1/aluno/checkins,
 * and the success pop. The check-in response carries fresh stats — tiles and
 * hero flip update from that one round trip (spec story 15), no refetch.
 */
class AlunoHomeViewModel(private val repository: AttendanceRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(AlunoHomeUiState())
    val uiState: StateFlow<AlunoHomeUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(home = AlunoHomeState.Loading) }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    home = when (val result = repository.alunoHome()) {
                        is ApiResult.Success -> AlunoHomeState.Loaded(result.value)
                        is ApiResult.Failure ->
                            AlunoHomeState.Error(result.error.toAttendanceMessageRes())
                    },
                )
            }
        }
    }

    // ---- sheet lifecycle -------------------------------------------------

    fun openCheckinSheet() = _uiState.update {
        it.copy(sheet = CheckinSheetState(visible = true), result = null)
    }

    fun dismissSheet() = _uiState.update { it.copy(sheet = CheckinSheetState()) }

    fun selectMethod(method: CheckinMethodTab) = _uiState.update {
        if (it.sheet.submitting) it
        else it.copy(sheet = it.sheet.copy(method = method, errorRes = null))
    }

    fun updateCodeInput(raw: String) = _uiState.update {
        it.copy(
            sheet = it.sheet.copy(
                codeInput = raw.filter(Char::isDigit).take(LIVE_CODE_LENGTH),
                errorRes = null,
            ),
        )
    }

    // ---- the three methods, one write path -------------------------------

    /** Scanner callback — debounced by `submitting` (frames keep coming). */
    fun onQrScanned(qrToken: String) {
        val sheet = _uiState.value.sheet
        if (!sheet.visible || sheet.submitting || qrToken.isBlank()) return
        submit { repository.checkInQr(qrToken) }
    }

    fun submitCode() {
        val sheet = _uiState.value.sheet
        if (!sheet.visible || sheet.submitting) return
        if (sheet.codeInput.length < LIVE_CODE_LENGTH) {
            _uiState.update { it.copy(sheet = it.sheet.copy(errorRes = null)) }
            return
        }
        submit { repository.checkInCode(sheet.codeInput) }
    }

    fun submitManual() {
        val sheet = _uiState.value.sheet
        if (!sheet.visible || sheet.submitting) return
        val classId = todayClassId() ?: return
        submit { repository.checkInManual(classId) }
    }

    fun dismissResult() = _uiState.update { it.copy(result = null) }

    private fun todayClassId(): String? =
        (_uiState.value.home as? AlunoHomeState.Loaded)?.home?.todayClass?.classId

    private fun submit(call: suspend () -> ApiResult<CheckinResponse>) {
        _uiState.update { it.copy(sheet = it.sheet.copy(submitting = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = call()) {
                is ApiResult.Success -> applyCheckin(result.value)
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        sheet = it.sheet.copy(
                            submitting = false,
                            errorRes = result.error.toAttendanceMessageRes(),
                        ),
                    )
                }
            }
        }
    }

    /** One round trip updates pop + tiles + hero flip (fresh stats in the response). */
    private fun applyCheckin(response: CheckinResponse) = _uiState.update { state ->
        val home = (state.home as? AlunoHomeState.Loaded)?.home
        val updatedHome = home?.copy(
            stats = response.stats,
            todayClass = home.todayClass?.let { today ->
                if (today.classId == response.session.classId) today.copy(checkedIn = true) else today
            },
        )
        state.copy(
            home = updatedHome?.let(AlunoHomeState::Loaded) ?: state.home,
            sheet = CheckinSheetState(),
            result = CheckinResultState(
                alreadyCheckedIn = response.status == CheckinStatus.ALREADY_CHECKED_IN,
                streak = response.stats.streak,
            ),
        )
    }
}
