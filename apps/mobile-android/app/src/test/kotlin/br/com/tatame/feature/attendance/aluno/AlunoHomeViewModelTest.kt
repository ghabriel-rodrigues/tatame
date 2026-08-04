package br.com.tatame.feature.attendance.aluno

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CheckinStatus
import br.com.tatame.testutil.FakeAttendanceRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.alunoHome
import br.com.tatame.testutil.alunoStats
import br.com.tatame.testutil.alunoToday
import br.com.tatame.testutil.checkinResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** ATT.19 — aluno Início + check-in sheet state machine over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class AlunoHomeViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun harness(): Pair<FakeAttendanceRepository, AlunoHomeViewModel> {
        val repository = FakeAttendanceRepository()
        repository.homeResult = ApiResult.Success(alunoHome())
        return repository to AlunoHomeViewModel(repository)
    }

    // ---- Início ----------------------------------------------------------

    @Test
    fun `home loads tiles and today class`() = runTest {
        val (_, viewModel) = harness()
        advanceUntilIdle()

        val home = viewModel.uiState.value.home
        assertTrue(home is AlunoHomeState.Loaded)
        val loaded = (home as AlunoHomeState.Loaded).home
        assertEquals(86.0, loaded.stats.monthPresencePct, 0.0)
        assertEquals(6, loaded.stats.streak)
        assertFalse(loaded.todayClass!!.checkedIn)
    }

    @Test
    fun `home failure surfaces mapped PT-BR copy`() = runTest {
        val repository = FakeAttendanceRepository()
        repository.homeResult = ApiResult.Failure(ApiError.Network)
        val viewModel = AlunoHomeViewModel(repository)
        advanceUntilIdle()

        assertEquals(
            AlunoHomeState.Error(R.string.error_network),
            viewModel.uiState.value.home,
        )
    }

    // ---- sheet mechanics -------------------------------------------------

    @Test
    fun `code input keeps digits only capped at four`() = runTest {
        val (_, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()

        viewModel.updateCodeInput("4a7-2999")

        assertEquals("4729", viewModel.uiState.value.sheet.codeInput)
    }

    @Test
    fun `method switch clears the error`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        repository.checkinResult = ApiResult.Failure(ApiError.Attendance.CodeInvalid)
        viewModel.selectMethod(CheckinMethodTab.CODE)
        viewModel.updateCodeInput("1111")
        viewModel.submitCode()
        advanceUntilIdle()
        assertEquals(R.string.error_checkin_code_invalid, viewModel.uiState.value.sheet.errorRes)

        viewModel.selectMethod(CheckinMethodTab.MANUAL)

        assertNull(viewModel.uiState.value.sheet.errorRes)
        assertEquals(CheckinMethodTab.MANUAL, viewModel.uiState.value.sheet.method)
    }

    // ---- check-in success ------------------------------------------------

    @Test
    fun `code check-in success closes the sheet flips the hero and refreshes stats`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        viewModel.selectMethod(CheckinMethodTab.CODE)
        viewModel.updateCodeInput("4729")
        repository.checkinResult = ApiResult.Success(checkinResponse())

        viewModel.submitCode()
        advanceUntilIdle()

        assertEquals(listOf("4729"), repository.codeCalls)
        val state = viewModel.uiState.value
        assertFalse(state.sheet.visible)
        // Fresh stats from the check-in response — no home refetch (story 15).
        assertEquals(1, repository.homeCalls)
        val home = (state.home as AlunoHomeState.Loaded).home
        assertEquals(88.0, home.stats.monthPresencePct, 0.0)
        assertEquals(7, home.stats.streak)
        assertTrue(home.todayClass!!.checkedIn) // hero flip (story 10)
        val result = state.result!!
        assertFalse(result.alreadyCheckedIn)
        assertEquals(7, result.streak)
    }

    @Test
    fun `duplicate check-in lands on the already-registered state not an error`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        repository.checkinResult =
            ApiResult.Success(checkinResponse(status = CheckinStatus.ALREADY_CHECKED_IN))

        viewModel.onQrScanned("scanned-token")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertNull(state.sheet.errorRes)
        assertTrue(state.result!!.alreadyCheckedIn)
    }

    @Test
    fun `streak line is hidden when the academy disabled gamification`() = runTest {
        val (repository, viewModel) = harness()
        repository.homeResult = ApiResult.Success(alunoHome(stats = alunoStats(streak = null)))
        viewModel.refresh()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        repository.checkinResult = ApiResult.Success(
            checkinResponse(stats = alunoStats(streak = null, totalLessons = 27)),
        )

        viewModel.onQrScanned("scanned-token")
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.result!!.streak)
        val home = (viewModel.uiState.value.home as AlunoHomeState.Loaded).home
        assertNull(home.stats.streak) // tile hidden on Início
    }

    // ---- errors & guards -------------------------------------------------

    @Test
    fun `invalid code keeps the sheet open with mapped copy`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        viewModel.selectMethod(CheckinMethodTab.CODE)
        viewModel.updateCodeInput("0000")
        repository.checkinResult = ApiResult.Failure(ApiError.Attendance.CodeInvalid)

        viewModel.submitCode()
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet
        assertTrue(sheet.visible)
        assertFalse(sheet.submitting)
        assertEquals(R.string.error_checkin_code_invalid, sheet.errorRes)
        assertNull(viewModel.uiState.value.result)
    }

    @Test
    fun `manual check-in targets the today class and is blocked without one`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        repository.checkinResult = ApiResult.Success(checkinResponse())

        viewModel.submitManual()
        advanceUntilIdle()
        assertEquals(listOf("c1"), repository.manualCalls)

        // No today class → the manual method has nothing to target.
        repository.homeResult = ApiResult.Success(alunoHome(todayClass = null))
        viewModel.refresh()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        viewModel.submitManual()
        advanceUntilIdle()
        assertEquals(1, repository.manualCalls.size)
    }

    @Test
    fun `qr scans are debounced while a submit is in flight`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        repository.checkinResult = ApiResult.Success(checkinResponse())

        viewModel.onQrScanned("token-1")
        viewModel.onQrScanned("token-1") // next camera frame, same code
        advanceUntilIdle()

        assertEquals(listOf("token-1"), repository.qrCalls)
    }

    @Test
    fun `re-check-in after revoke works from the flipped hero state`() = runTest {
        // Spec story 12: a revoked aluno can check in again — the sheet still
        // submits even when the hero was previously flipped.
        val (repository, viewModel) = harness()
        repository.homeResult =
            ApiResult.Success(alunoHome(todayClass = alunoToday(checkedIn = true)))
        viewModel.refresh()
        advanceUntilIdle()
        viewModel.openCheckinSheet()
        repository.checkinResult = ApiResult.Success(checkinResponse())

        viewModel.submitManual()
        advanceUntilIdle()

        assertEquals(listOf("c1"), repository.manualCalls)
        assertFalse(viewModel.uiState.value.result!!.alreadyCheckedIn)
    }
}
