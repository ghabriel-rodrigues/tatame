package br.com.tatame.feature.attendance.professor

import br.com.tatame.R
import br.com.tatame.core.attendance.LiveStreamEvent
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.LiveStreamCheckinEvent
import br.com.tatame.core.network.dto.LiveStreamRevokeEvent
import br.com.tatame.testutil.FakeAttendanceRepository
import br.com.tatame.testutil.FakeLiveStreamClient
import br.com.tatame.testutil.FakeLiveStreamClient.Script
import br.com.tatame.testutil.MainDispatcherRule
import androidx.lifecycle.viewModelScope
import br.com.tatame.testutil.liveCode
import br.com.tatame.testutil.liveSnapshot
import br.com.tatame.testutil.snapshotAttendance
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * ATT.20 — chamada ao vivo state machine (JVM): snapshot-then-stream, event
 * application, ticket re-mint on drop, double-drop → 5 s polling fallback,
 * encerrar/reopen. Transports are fakes; the real SSE wire is covered by
 * OkHttpLiveStreamClientTest.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LiveChamadaViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun checkinEvent(id: String, count: Int) = LiveStreamEvent.Checkin(
        LiveStreamCheckinEvent(
            attendanceId = id,
            studentId = "st-$id",
            studentName = "Aluno $id",
            method = "qr",
            checkedInAt = "2026-08-03T13:07:00Z",
            presentCount = count,
        ),
    )

    private fun harness(): Triple<FakeAttendanceRepository, FakeLiveStreamClient, () -> LiveChamadaViewModel> {
        val repository = FakeAttendanceRepository()
        val stream = FakeLiveStreamClient()
        repository.openLiveResult = ApiResult.Success(liveCode(presentCount = 0))
        repository.snapshotResult = ApiResult.Success(liveSnapshot())
        return Triple(repository, stream) { LiveChamadaViewModel("c1", repository, stream) }
    }

    /**
     * The chamada's stream/poll loops outlive a test body (viewModelScope is
     * not a child of the test scope, but its virtual-time delays are on the
     * shared scheduler) — cancel explicitly so runTest never chases an
     * endless 5 s poll timer.
     */
    private fun LiveChamadaViewModel.stop() = viewModelScope.cancel()

    @Test
    fun `open failure surfaces mapped copy`() = runTest {
        val (repository, stream, create) = harness()
        repository.openLiveResult = ApiResult.Failure(ApiError.NotFound) // foreign class → 404
        val viewModel = create()
        advanceUntilIdle()

        assertEquals(LiveChamadaState.Error(R.string.error_not_found), viewModel.uiState.value)
        assertTrue(stream.connections.isEmpty())
        viewModel.stop()
    }

    @Test
    fun `open snapshots first then applies stream checkin and revoke events`() = runTest {
        val (repository, stream, create) = harness()
        repository.snapshotResult = ApiResult.Success(
            liveSnapshot(presentCount = 1, attendances = listOf(snapshotAttendance("a1"))),
        )
        stream.script += Script.EmitThenHang(
            listOf(
                LiveStreamEvent.Opened,
                LiveStreamEvent.Heartbeat,
                checkinEvent("a2", count = 2),
                LiveStreamEvent.Revoke(LiveStreamRevokeEvent(attendanceId = "a1", presentCount = 1)),
            ),
        )
        val viewModel = create()
        advanceUntilIdle()

        // Snapshot before stream (spec protocol), ticket minted for the connect.
        assertEquals(listOf("lc1"), repository.snapshotCalls)
        assertEquals(listOf("lc1"), repository.ticketCalls)
        assertEquals(listOf("lc1" to "ticket-1"), stream.connections)

        val open = viewModel.uiState.value as LiveChamadaState.Open
        assertEquals("4729", open.live.code)
        assertEquals(LiveConnectionMode.STREAMING, open.connection)
        assertEquals(1, open.presentCount) // 1 (snapshot) +1 (checkin) -1 (revoke)
        assertEquals(listOf("a2"), open.arrivals.map { it.id }) // a1 revoked away
        viewModel.stop()
    }

    @Test
    fun `two stream drops fall back to five second polling of the snapshot`() = runTest {
        val (repository, stream, create) = harness()
        // No script entries → every connect fails.
        val viewModel = create()
        runCurrent()

        val open = viewModel.uiState.value as LiveChamadaState.Open
        assertEquals(LiveConnectionMode.POLLING, open.connection)
        assertEquals(2, stream.connections.size) // dropped twice, then gave up
        val snapshotsBefore = repository.snapshotCalls.size

        repository.snapshotResult = ApiResult.Success(
            liveSnapshot(presentCount = 3, attendances = listOf(snapshotAttendance("a7"))),
        )
        advanceTimeBy(5_001)
        runCurrent()

        assertEquals(snapshotsBefore + 1, repository.snapshotCalls.size)
        val polled = viewModel.uiState.value as LiveChamadaState.Open
        assertEquals(3, polled.presentCount)
        assertEquals(listOf("a7"), polled.arrivals.map { it.id })
        viewModel.stop()
    }

    @Test
    fun `stream recovers after a single drop with a fresh ticket`() = runTest {
        val (repository, stream, create) = harness()
        stream.script += Script.EmitThenFail(listOf(LiveStreamEvent.Opened))
        stream.script += Script.EmitThenHang(listOf(LiveStreamEvent.Opened, checkinEvent("a1", 1)))
        val viewModel = create()
        advanceUntilIdle()

        assertEquals(2, stream.connections.size)
        assertEquals(2, repository.ticketCalls.size) // re-minted on reconnect
        val open = viewModel.uiState.value as LiveChamadaState.Open
        assertEquals(LiveConnectionMode.STREAMING, open.connection)
        assertEquals(1, open.presentCount)
        viewModel.stop()
    }

    @Test
    fun `encerrar closes the chamada and reopen mints a fresh code`() = runTest {
        val (repository, stream, create) = harness()
        stream.script += Script.EmitThenHang(listOf(LiveStreamEvent.Opened))
        repository.closeLiveResult = ApiResult.Success(liveCode(presentCount = 9))
        val viewModel = create()
        advanceUntilIdle()

        viewModel.encerrar()
        advanceUntilIdle()

        assertEquals(listOf("lc1"), repository.closeLiveCalls)
        val closed = viewModel.uiState.value as LiveChamadaState.Closed
        assertEquals(9, closed.presentCount)

        stream.script += Script.EmitThenHang(listOf(LiveStreamEvent.Opened))
        repository.openLiveResult = ApiResult.Success(liveCode(id = "lc2", code = "8113"))
        viewModel.reopen()
        advanceUntilIdle()

        assertEquals(2, repository.openLiveCalls.size)
        val reopened = viewModel.uiState.value as LiveChamadaState.Open
        assertEquals("8113", reopened.live.code) // fresh code, same session
        viewModel.stop()
    }

    @Test
    fun `countdown formats remaining time and expires to null`() {
        val expiresAt = "2026-08-03T14:15:00Z"
        val expiresMs = java.time.Instant.parse(expiresAt).toEpochMilli()

        assertEquals("09:42", LiveChamadaViewModel.formatRemaining(expiresAt, expiresMs - 582_000))
        assertEquals("00:01", LiveChamadaViewModel.formatRemaining(expiresAt, expiresMs - 1_000))
        assertEquals(null, LiveChamadaViewModel.formatRemaining(expiresAt, expiresMs))
        assertEquals(null, LiveChamadaViewModel.formatRemaining(expiresAt, expiresMs + 5_000))
        assertEquals(null, LiveChamadaViewModel.formatRemaining("not-a-date", 0L))
    }
}
