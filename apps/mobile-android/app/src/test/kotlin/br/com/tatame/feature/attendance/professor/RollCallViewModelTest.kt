package br.com.tatame.feature.attendance.professor

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CheckinStatus
import br.com.tatame.core.network.dto.RosterAttendance
import br.com.tatame.testutil.FakeAttendanceRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.markResponse
import br.com.tatame.testutil.revokeResponse
import br.com.tatame.testutil.rollCallResponse
import br.com.tatame.testutil.rollCallRow
import br.com.tatame.testutil.selfAttendance
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** ATT.21 — chamada manual state machine over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class RollCallViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun harness(
        rollCallResult: ApiResult<br.com.tatame.core.network.dto.RollCallResponse> =
            ApiResult.Success(
                rollCallResponse(
                    rows = listOf(
                        rollCallRow("s1", name = "Lucas Almeida", attendance = selfAttendance("a1")),
                        rollCallRow("s2", name = "João Ferraz"),
                        rollCallRow(
                            "s3",
                            name = "Tiago Mota",
                            attendance = RosterAttendance(
                                id = "a3",
                                method = "manual",
                                checkedInAt = "2026-08-03T13:04:00Z",
                                recordedByUserId = "prof-1",
                            ),
                        ),
                    ),
                ),
            ),
    ): Pair<FakeAttendanceRepository, RollCallViewModel> {
        val repository = FakeAttendanceRepository()
        repository.rollCallResult = rollCallResult
        return repository to RollCallViewModel("c1", repository)
    }

    @Test
    fun `open loads the roster with self check-ins pre-toggled and manual markers`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        assertEquals(listOf("c1"), repository.rollCallCalls)
        val loaded = viewModel.uiState.value as RollCallState.Loaded
        assertEquals(2, loaded.presentCount) // "N presentes de M" header numerator
        assertEquals(3, loaded.rows.size)

        val self = loaded.rows[0]
        assertEquals("a1", self.attendanceId) // QR self check-in pre-toggled
        assertFalse(self.manual)
        assertFalse(self.recordedByProfessor)

        assertNull(loaded.rows[1].attendanceId)

        val manual = loaded.rows[2]
        assertTrue(manual.manual) // professor-recorded manual marker
        assertTrue(manual.recordedByProfessor)
    }

    @Test
    fun `open failure surfaces mapped copy`() = runTest {
        val (_, viewModel) = harness(rollCallResult = ApiResult.Failure(ApiError.NotFound))
        advanceUntilIdle()

        assertEquals(RollCallState.Error(R.string.error_not_found), viewModel.uiState.value)
    }

    @Test
    fun `toggling an absent student marks a manual presence immediately`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        repository.markResult =
            ApiResult.Success(markResponse(attendanceId = "a-new", studentId = "s2", presentCount = 3))

        viewModel.toggle("s2")
        advanceUntilIdle()

        assertEquals(listOf("cs1" to "s2"), repository.markCalls) // session id, per-row insert
        val loaded = viewModel.uiState.value as RollCallState.Loaded
        assertEquals(3, loaded.presentCount)
        val row = loaded.rows.first { it.studentId == "s2" }
        assertEquals("a-new", row.attendanceId)
        assertTrue(row.manual)
        assertTrue(row.recordedByProfessor)
        assertFalse(row.pending)
    }

    @Test
    fun `benign already-checked-in mark keeps the row toggled on`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        repository.markResult = ApiResult.Success(
            markResponse(
                status = CheckinStatus.ALREADY_CHECKED_IN,
                attendanceId = "a-race",
                studentId = "s2",
                presentCount = 3,
            ),
        )

        viewModel.toggle("s2")
        advanceUntilIdle()

        val loaded = viewModel.uiState.value as RollCallState.Loaded
        assertEquals("a-race", loaded.rows.first { it.studentId == "s2" }.attendanceId)
        assertNull(loaded.noticeRes)
    }

    @Test
    fun `toggling a present student revokes through the void seam`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        repository.revokeResult =
            ApiResult.Success(revokeResponse(attendanceId = "a1", presentCount = 1))

        viewModel.toggle("s1")
        advanceUntilIdle()

        assertEquals(listOf("a1"), repository.revokeCalls)
        val loaded = viewModel.uiState.value as RollCallState.Loaded
        assertEquals(1, loaded.presentCount)
        val row = loaded.rows.first { it.studentId == "s1" }
        assertNull(row.attendanceId)
        assertFalse(row.manual)
    }

    @Test
    fun `revoke window closed maps to PT-BR copy and keeps the row present`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        repository.revokeResult = ApiResult.Failure(ApiError.Attendance.RevokeWindowClosed)

        viewModel.toggle("s1")
        advanceUntilIdle()

        val loaded = viewModel.uiState.value as RollCallState.Loaded
        assertEquals(R.string.error_revoke_window_closed, loaded.noticeRes)
        assertEquals("a1", loaded.rows.first { it.studentId == "s1" }.attendanceId)

        viewModel.dismissNotice()
        assertNull((viewModel.uiState.value as RollCallState.Loaded).noticeRes)
    }

    @Test
    fun `a pending row ignores further taps`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        repository.markResult = ApiResult.Success(markResponse(studentId = "s2"))

        viewModel.toggle("s2") // sets pending synchronously
        viewModel.toggle("s2") // ignored while in flight
        advanceUntilIdle()

        assertEquals(1, repository.markCalls.size)
    }
}
