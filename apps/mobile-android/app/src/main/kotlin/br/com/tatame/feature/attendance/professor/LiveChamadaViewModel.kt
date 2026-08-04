package br.com.tatame.feature.attendance.professor

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.attendance.AttendanceRepository
import br.com.tatame.core.attendance.LiveStreamClient
import br.com.tatame.core.attendance.LiveStreamEvent
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.LiveCodeResponse
import br.com.tatame.core.network.dto.SnapshotAttendance
import br.com.tatame.feature.attendance.toAttendanceMessageRes
import java.time.Instant
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** How the live counter is currently fed. */
enum class LiveConnectionMode { CONNECTING, STREAMING, POLLING }

/** Chamada ao vivo screen state (ATT.20, professor-03). */
sealed interface LiveChamadaState {
    data object Loading : LiveChamadaState

    data class Error(@param:StringRes val messageRes: Int) : LiveChamadaState

    /** Chamada aberta — big code, QR, countdown, live counter + arriving list. */
    data class Open(
        val live: LiveCodeResponse,
        val presentCount: Int,
        val arrivals: List<SnapshotAttendance>,
        val connection: LiveConnectionMode = LiveConnectionMode.CONNECTING,
        val closing: Boolean = false,
    ) : LiveChamadaState

    /** Encerrada — code/QR invalidated; reopen mints a fresh code for the same session. */
    data class Closed(
        val live: LiveCodeResponse,
        val presentCount: Int,
    ) : LiveChamadaState
}

/**
 * Chamada ao vivo state machine (ATT.20): open (idempotent server-side) →
 * snapshot-then-stream (SSE per the resolved realtime decision) → apply
 * checkin/revoke events; ticket re-mint + reconnect on drop; after
 * [MAX_STREAM_DROPS] failures fall back to [POLL_INTERVAL_MS] polling of the
 * snapshot endpoint; encerrar revokes the code, reopen starts over.
 */
class LiveChamadaViewModel(
    private val classId: String,
    private val repository: AttendanceRepository,
    private val streamClient: LiveStreamClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow<LiveChamadaState>(LiveChamadaState.Loading)
    val uiState: StateFlow<LiveChamadaState> = _uiState.asStateFlow()

    private var liveJob: Job? = null

    init {
        open()
    }

    fun open() {
        liveJob?.cancel()
        _uiState.value = LiveChamadaState.Loading
        viewModelScope.launch {
            when (val result = repository.openLiveCode(classId)) {
                is ApiResult.Success -> {
                    val live = result.value
                    _uiState.value = LiveChamadaState.Open(
                        live = live,
                        presentCount = live.presentCount,
                        arrivals = emptyList(),
                    )
                    liveJob = viewModelScope.launch { runLive(live.id) }
                }
                is ApiResult.Failure ->
                    _uiState.value = LiveChamadaState.Error(result.error.toAttendanceMessageRes())
            }
        }
    }

    fun encerrar() {
        val open = _uiState.value as? LiveChamadaState.Open ?: return
        if (open.closing) return
        _uiState.value = open.copy(closing = true)
        viewModelScope.launch {
            when (val result = repository.closeLiveCode(open.live.id)) {
                is ApiResult.Success -> {
                    liveJob?.cancel()
                    _uiState.value = LiveChamadaState.Closed(
                        live = result.value,
                        presentCount = result.value.presentCount,
                    )
                }
                is ApiResult.Failure -> _uiState.update { state ->
                    // Keep the chamada running; surface nothing worse than un-flagging closing.
                    (state as? LiveChamadaState.Open)?.copy(closing = false) ?: state
                }
            }
        }
    }

    /** Reopen after encerrar — the server mints a fresh code for the same session. */
    fun reopen() {
        if (_uiState.value is LiveChamadaState.Closed) open()
    }

    override fun onCleared() {
        liveJob?.cancel()
    }

    // ---- snapshot-then-stream with polling fallback ----------------------

    private suspend fun runLive(liveCodeId: String) {
        var drops = 0
        while (currentCoroutineIsActive()) {
            refreshSnapshot(liveCodeId)
            if (drops >= MAX_STREAM_DROPS) break

            val ticket = when (val minted = repository.mintStreamTicket(liveCodeId)) {
                is ApiResult.Success -> minted.value.ticket
                is ApiResult.Failure -> null
            }
            if (ticket == null) {
                drops++
                continue
            }

            var failed = false
            streamClient.stream(liveCodeId, ticket)
                .catch { failed = true } // connect failure or mid-stream drop
                .collect { event -> applyStreamEvent(event) }
            // Completion (normal or failed) is a drop — reconnect with a fresh
            // ticket, or fall back to polling after MAX_STREAM_DROPS.
            drops++
            setConnection(LiveConnectionMode.CONNECTING)
            if (failed && drops >= MAX_STREAM_DROPS) break
        }
        pollLoop(liveCodeId)
    }

    private suspend fun pollLoop(liveCodeId: String) {
        setConnection(LiveConnectionMode.POLLING)
        while (currentCoroutineIsActive()) {
            delay(POLL_INTERVAL_MS)
            refreshSnapshot(liveCodeId)
        }
    }

    private suspend fun refreshSnapshot(liveCodeId: String) {
        when (val snapshot = repository.liveSnapshot(liveCodeId)) {
            is ApiResult.Success -> _uiState.update { state ->
                (state as? LiveChamadaState.Open)?.copy(
                    presentCount = snapshot.value.presentCount,
                    arrivals = snapshot.value.attendances,
                ) ?: state
            }
            is ApiResult.Failure -> Unit // transient — the loop keeps its cadence
        }
    }

    private fun applyStreamEvent(event: LiveStreamEvent) {
        when (event) {
            is LiveStreamEvent.Opened -> setConnection(LiveConnectionMode.STREAMING)
            is LiveStreamEvent.Checkin -> _uiState.update { state ->
                val open = state as? LiveChamadaState.Open ?: return@update state
                val payload = event.payload
                if (open.arrivals.any { it.id == payload.attendanceId }) {
                    open.copy(presentCount = payload.presentCount)
                } else {
                    open.copy(
                        presentCount = payload.presentCount,
                        arrivals = open.arrivals + SnapshotAttendance(
                            id = payload.attendanceId,
                            studentId = payload.studentId,
                            studentName = payload.studentName,
                            method = payload.method,
                            checkedInAt = payload.checkedInAt,
                        ),
                    )
                }
            }
            is LiveStreamEvent.Revoke -> _uiState.update { state ->
                val open = state as? LiveChamadaState.Open ?: return@update state
                open.copy(
                    presentCount = event.payload.presentCount,
                    arrivals = open.arrivals.filterNot { it.id == event.payload.attendanceId },
                )
            }
            is LiveStreamEvent.Heartbeat -> Unit
        }
    }

    private fun setConnection(mode: LiveConnectionMode) = _uiState.update { state ->
        (state as? LiveChamadaState.Open)?.copy(connection = mode) ?: state
    }

    private suspend fun currentCoroutineIsActive(): Boolean =
        kotlinx.coroutines.currentCoroutineContext().isActive

    companion object {
        const val MAX_STREAM_DROPS = 2
        const val POLL_INTERVAL_MS = 5_000L

        /**
         * "Expira em 09:42" countdown text — pure so it is unit-testable.
         * Returns null once expired (UI shows the expired notice instead).
         */
        fun formatRemaining(expiresAtIso: String, nowMs: Long): String? {
            val expiresMs = runCatching { Instant.parse(expiresAtIso).toEpochMilli() }
                .getOrNull() ?: return null
            val remaining = expiresMs - nowMs
            if (remaining <= 0) return null
            val totalSeconds = remaining / 1_000
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return "%02d:%02d".format(minutes, seconds)
        }
    }
}
