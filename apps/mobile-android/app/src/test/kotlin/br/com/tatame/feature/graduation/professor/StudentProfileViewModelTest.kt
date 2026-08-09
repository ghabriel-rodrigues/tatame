package br.com.tatame.feature.graduation.professor

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.testutil.FakeGraduationRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.awardResponse
import br.com.tatame.testutil.beltView
import br.com.tatame.testutil.professorProfile
import br.com.tatame.testutil.studentNote
import br.com.tatame.testutil.studentProfile
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * GRD.20 — perfil do aluno state machine: award flows (validations, toggle
 * gating, PT-BR error mapping), promote targeting over the merged régua, and
 * persistent observações (JVM, fake repository).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StudentProfileViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun harness(
        canUpdate: Boolean = true,
        degrees: Int = 2,
        maxDegrees: Int = 4,
    ): Pair<FakeGraduationRepository, StudentProfileViewModel> {
        val repository = FakeGraduationRepository()
        repository.studentProfileResult = ApiResult.Success(
            studentProfile(belt = beltView(degrees = degrees, maxDegrees = maxDegrees)),
        )
        repository.professorProfileResult = ApiResult.Success(professorProfile())
        val viewModel = StudentProfileViewModel(
            studentId = "st1",
            canUpdateGraduations = canUpdate,
            repository = repository,
        )
        return repository to viewModel
    }

    // ---- load ------------------------------------------------------------

    @Test
    fun `load fetches profile and régua together`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.profile is StudentProfileState.Loaded)
        assertEquals(10, state.validGraduations.size)
        assertEquals(listOf("st1"), repository.studentProfileCalls)
        assertEquals(1, repository.professorProfileCalls)
    }

    @Test
    fun `foreign student surfaces not found copy`() = runTest {
        val repository = FakeGraduationRepository()
        repository.studentProfileResult = ApiResult.Failure(ApiError.NotFound)
        repository.professorProfileResult = ApiResult.Success(professorProfile())
        val viewModel = StudentProfileViewModel("ghost", true, repository)
        advanceUntilIdle()

        assertEquals(
            StudentProfileState.Error(R.string.error_not_found),
            viewModel.uiState.value.profile,
        )
    }

    // ---- add degree ------------------------------------------------------

    @Test
    fun `add degree confirms then posts the optional observação and refetches`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        viewModel.requestAddDegree()
        val dialog = viewModel.uiState.value.awardDialog
        assertEquals(AwardAction.ADD_DEGREE, dialog?.action)
        assertEquals(3, dialog?.nextDegree)

        repository.addDegreeResult = ApiResult.Success(awardResponse())
        viewModel.updateAwardNotes("Exame de faixa — aprovado.")
        viewModel.confirmAward()
        advanceUntilIdle()

        assertEquals(listOf("st1" to "Exame de faixa — aprovado."), repository.addDegreeCalls)
        assertNull(viewModel.uiState.value.awardDialog)
        // Derived belt changed server-side — profile is refetched, not patched.
        assertEquals(listOf("st1", "st1"), repository.studentProfileCalls)
    }

    @Test
    fun `add degree is blocked at the belt maximum`() = runTest {
        val (_, viewModel) = harness(degrees = 4, maxDegrees = 4)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.canAddDegree)
        viewModel.requestAddDegree()
        assertNull(viewModel.uiState.value.awardDialog)
    }

    @Test
    fun `award failure maps the stable code to PT-BR copy and keeps the dialog`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        repository.addDegreeResult = ApiResult.Failure(ApiError.Graduation.DegreeAtMax)
        viewModel.requestAddDegree()
        viewModel.confirmAward()
        advanceUntilIdle()

        val dialog = viewModel.uiState.value.awardDialog
        assertEquals(R.string.error_graduation_degree_at_max, dialog?.errorRes)
        assertFalse(dialog!!.submitting)
    }

    @Test
    fun `server-side toggle rejection maps to permission-disabled copy`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        repository.addDegreeResult = ApiResult.Failure(ApiError.Auth.PermissionDisabled)
        viewModel.requestAddDegree()
        viewModel.confirmAward()
        advanceUntilIdle()

        assertEquals(
            R.string.error_permission_disabled,
            viewModel.uiState.value.awardDialog?.errorRes,
        )
    }

    // ---- toggle gating (story 15) ----------------------------------------

    @Test
    fun `toggle off hides both actions client-side`() = runTest {
        val (_, viewModel) = harness(canUpdate = false)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.canUpdateGraduations)
        viewModel.requestAddDegree()
        viewModel.requestPromoteBelt()
        assertNull(viewModel.uiState.value.awardDialog)
    }

    // ---- promote belt ----------------------------------------------------

    @Test
    fun `promote targets the next enabled belt of the merged régua`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        assertEquals("b-purple", viewModel.uiState.value.promoteTarget?.beltId)
        viewModel.requestPromoteBelt()
        assertEquals(
            "b-purple",
            viewModel.uiState.value.awardDialog?.targetBelt?.beltId,
        )

        repository.promoteResult = ApiResult.Success(
            awardResponse(belt = beltView(beltId = "b-purple", name = "Roxa", degrees = 0)),
        )
        viewModel.confirmAward()
        advanceUntilIdle()

        assertEquals(Triple("st1", "b-purple", null), repository.promoteCalls.single())
        assertNull(viewModel.uiState.value.awardDialog)
    }

    @Test
    fun `promote is disabled without a régua target`() = runTest {
        val repository = FakeGraduationRepository()
        repository.studentProfileResult = ApiResult.Success(studentProfile())
        // Régua load failed — no target, action stays disabled (never guesses).
        repository.professorProfileResult = ApiResult.Failure(ApiError.Network)
        val viewModel = StudentProfileViewModel("st1", true, repository)
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.promoteTarget)
        viewModel.requestPromoteBelt()
        assertNull(viewModel.uiState.value.awardDialog)
    }

    // ---- observações -----------------------------------------------------

    @Test
    fun `save note posts and prepends the created note`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        repository.createNoteResult =
            ApiResult.Success(studentNote(id = "n-new", body = "Pediu foco em raspagens."))
        viewModel.updateNoteInput("Pediu foco em raspagens.")
        viewModel.saveNote()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("st1" to "Pediu foco em raspagens."), repository.createNoteCalls)
        assertEquals("", state.noteInput)
        val notes = (state.profile as StudentProfileState.Loaded).profile.notes
        assertEquals(listOf("n-new", "n1"), notes.map { it.id })
    }

    @Test
    fun `blank note is never posted and failures surface copy`() = runTest {
        val (repository, viewModel) = harness()
        advanceUntilIdle()

        viewModel.updateNoteInput("   ")
        viewModel.saveNote()
        assertTrue(repository.createNoteCalls.isEmpty())

        repository.createNoteResult = ApiResult.Failure(ApiError.Tenant.ReadOnly)
        viewModel.updateNoteInput("Nota válida")
        viewModel.saveNote()
        advanceUntilIdle()

        assertEquals(R.string.error_read_only, viewModel.uiState.value.noteErrorRes)
        assertEquals("Nota válida", viewModel.uiState.value.noteInput)
    }
}
