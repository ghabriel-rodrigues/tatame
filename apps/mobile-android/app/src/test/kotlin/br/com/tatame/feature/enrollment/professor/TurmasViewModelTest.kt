package br.com.tatame.feature.enrollment.professor

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.EnrollmentResult
import br.com.tatame.testutil.FakeEnrollmentRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.classDetail
import br.com.tatame.testutil.classItem
import br.com.tatame.testutil.rosterStudent
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** ENR.21/22 — professor turmas state machine over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class TurmasViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun harness(): Pair<FakeEnrollmentRepository, TurmasViewModel> {
        val repository = FakeEnrollmentRepository()
        return repository to TurmasViewModel(repository)
    }

    // ---- list (ENR.21) --------------------------------------------------

    @Test
    fun `list loads classes with server-derived occupancy`() = runTest {
        val (repository, viewModel) = harness()
        repository.classesResult = ApiResult.Success(
            listOf(classItem("c1", occupancy = 24, capacity = 24, lotada = true)),
        )
        viewModel.refresh()
        advanceUntilIdle()

        val list = viewModel.uiState.value.list
        assertTrue(list is TurmasListState.Loaded)
        val turma = (list as TurmasListState.Loaded).classes.single()
        assertTrue(turma.lotada)
        assertEquals(24, turma.occupancy)
    }

    @Test
    fun `list failure surfaces mapped PT-BR copy`() = runTest {
        val (repository, viewModel) = harness()
        repository.classesResult = ApiResult.Failure(ApiError.Network)
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(
            TurmasListState.Error(R.string.error_network),
            viewModel.uiState.value.list,
        )
    }

    // ---- detail (ENR.21) ------------------------------------------------

    @Test
    fun `opening a turma loads its detail and closing returns to the list`() = runTest {
        val (repository, viewModel) = harness()
        repository.classesResult = ApiResult.Success(listOf(classItem("c1")))
        repository.detailResults["c1"] =
            ApiResult.Success(classDetail("c1", roster = listOf(rosterStudent("s1"))))
        advanceUntilIdle()

        viewModel.openTurma("c1")
        advanceUntilIdle()
        val detail = viewModel.uiState.value.detail
        assertTrue(detail is TurmaDetailState.Loaded)
        assertEquals("s1", (detail as TurmaDetailState.Loaded).detail.roster.single().studentId)

        viewModel.closeTurma()
        advanceUntilIdle()
        assertEquals(TurmaDetailState.Hidden, viewModel.uiState.value.detail)
    }

    @Test
    fun `foreign class 404 surfaces as detail error`() = runTest {
        val (_, viewModel) = harness()
        viewModel.openTurma("not-mine")
        advanceUntilIdle()

        assertEquals(
            TurmaDetailState.Error(R.string.error_not_found),
            viewModel.uiState.value.detail,
        )
    }

    // ---- adicionar aluno (ENR.22) ---------------------------------------

    private suspend fun kotlinx.coroutines.test.TestScope.openedTurma(
        repository: FakeEnrollmentRepository,
        viewModel: TurmasViewModel,
    ) {
        repository.classesResult = ApiResult.Success(listOf(classItem("c1"), classItem("c2")))
        repository.detailResults["c1"] =
            ApiResult.Success(classDetail("c1", roster = listOf(rosterStudent("s1"))))
        repository.detailResults["c2"] = ApiResult.Success(
            classDetail(
                "c2",
                roster = listOf(
                    rosterStudent("s1", name = "Ana"),
                    rosterStudent("s2", name = "Marina Costa"),
                    rosterStudent("s3", name = "Bia Andrade"),
                ),
            ),
        )
        viewModel.refresh()
        advanceUntilIdle()
        viewModel.openTurma("c1")
        advanceUntilIdle()
    }

    @Test
    fun `add sheet offers other rosters minus already-enrolled, sorted`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)

        viewModel.openAddSheet()
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.addSheet
        assertTrue(sheet.visible)
        assertEquals(listOf("s3", "s2"), sheet.candidates.map { it.studentId }) // Bia < Marina
    }

    @Test
    fun `adding a student refetches the detail and drops the candidate`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)
        viewModel.openAddSheet()
        advanceUntilIdle()
        repository.addResult =
            ApiResult.Success(EnrollmentResult(classId = "c1", studentId = "s2", status = "active"))
        val detailFetchesBefore = repository.detailCalls.count { it == "c1" }

        viewModel.addStudent("s2")
        advanceUntilIdle()

        assertEquals(listOf("c1" to "s2"), repository.addCalls)
        assertEquals(detailFetchesBefore + 1, repository.detailCalls.count { it == "c1" })
        assertEquals(listOf("s3"), viewModel.uiState.value.addSheet.candidates.map { it.studentId })
        assertNull(viewModel.uiState.value.addSheet.errorRes)
    }

    @Test
    fun `adding to a full class surfaces the class-full copy in the sheet`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)
        viewModel.openAddSheet()
        advanceUntilIdle()
        repository.addResult = ApiResult.Failure(ApiError.Enrollment.ClassFull)

        viewModel.addStudent("s2")
        advanceUntilIdle()

        assertEquals(R.string.error_class_full, viewModel.uiState.value.addSheet.errorRes)
    }

    @Test
    fun `already enrolled maps to its own copy`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)
        viewModel.openAddSheet()
        advanceUntilIdle()
        repository.addResult = ApiResult.Failure(ApiError.Enrollment.AlreadyEnrolled)

        viewModel.addStudent("s2")
        advanceUntilIdle()

        assertEquals(R.string.error_already_enrolled, viewModel.uiState.value.addSheet.errorRes)
    }

    // ---- remover aluno (ENR.22) -----------------------------------------

    @Test
    fun `remove asks for confirmation before calling the API`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)
        val student = rosterStudent("s1")

        viewModel.requestRemove(student)
        assertEquals(student, viewModel.uiState.value.removeDialog?.student)
        assertTrue(repository.removeCalls.isEmpty())

        viewModel.dismissRemove()
        assertNull(viewModel.uiState.value.removeDialog)
        assertTrue(repository.removeCalls.isEmpty())
    }

    @Test
    fun `confirming remove calls the API and refetches the detail`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)
        repository.removeResult =
            ApiResult.Success(EnrollmentResult(classId = "c1", studentId = "s1", status = "removed"))
        val detailFetchesBefore = repository.detailCalls.count { it == "c1" }

        viewModel.requestRemove(rosterStudent("s1"))
        viewModel.confirmRemove()
        advanceUntilIdle()

        assertEquals(listOf("c1" to "s1"), repository.removeCalls)
        assertNull(viewModel.uiState.value.removeDialog)
        assertEquals(detailFetchesBefore + 1, repository.detailCalls.count { it == "c1" })
    }

    @Test
    fun `remove failure surfaces the action error notice`() = runTest {
        val (repository, viewModel) = harness()
        openedTurma(repository, viewModel)
        repository.removeResult = ApiResult.Failure(ApiError.Tenant.ReadOnly)

        viewModel.requestRemove(rosterStudent("s1"))
        viewModel.confirmRemove()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.removeDialog)
        assertEquals(R.string.error_read_only, viewModel.uiState.value.actionErrorRes)

        viewModel.dismissActionError()
        assertNull(viewModel.uiState.value.actionErrorRes)
    }
}
