package br.com.tatame.feature.enrollment.responsavel

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.RegisterDependentResponse
import br.com.tatame.testutil.FakeEnrollmentRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.dependent
import br.com.tatame.testutil.suggestion
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** ENR.22/23 — responsável dependents + cadastrar-aluno state machine (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class DependentsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun harness(
        canRegister: Boolean = true,
    ): Pair<FakeEnrollmentRepository, DependentsViewModel> {
        val repository = FakeEnrollmentRepository()
        return repository to DependentsViewModel(repository, canRegisterDependents = canRegister)
    }

    // ---- panel (ENR.22) -------------------------------------------------

    @Test
    fun `panel loads the dependents list`() = runTest {
        val (repository, viewModel) = harness()
        repository.dependentsResult =
            ApiResult.Success(listOf(dependent("d1", name = "Pedro Silveira")))
        viewModel.refresh()
        advanceUntilIdle()

        val list = viewModel.uiState.value.list
        assertTrue(list is DependentsListState.Loaded)
        assertEquals("Pedro Silveira", (list as DependentsListState.Loaded).dependents.single().fullName)
    }

    @Test
    fun `panel failure surfaces mapped copy`() = runTest {
        val (repository, viewModel) = harness()
        repository.dependentsResult = ApiResult.Failure(ApiError.Timeout)
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(DependentsListState.Error(R.string.error_timeout), viewModel.uiState.value.list)
    }

    @Test
    fun `foreign dependent 404 surfaces as detail error`() = runTest {
        val (_, viewModel) = harness()
        viewModel.openDependent("not-mine")
        advanceUntilIdle()

        assertEquals(
            DependentDetailState.Error(R.string.error_not_found),
            viewModel.uiState.value.detail,
        )
    }

    @Test
    fun `opening a dependent loads its detail`() = runTest {
        val (repository, viewModel) = harness()
        repository.dependentResults["d1"] = ApiResult.Success(dependent("d1"))
        viewModel.openDependent("d1")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.detail is DependentDetailState.Loaded)
        viewModel.closeDependent()
        assertEquals(DependentDetailState.Hidden, viewModel.uiState.value.detail)
    }

    // ---- toggle off (ENR.23, story 36) ----------------------------------

    @Test
    fun `dependents-register toggle off hides and inertizes the sheet`() = runTest {
        val (repository, viewModel) = harness(canRegister = false)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.canRegister)

        viewModel.openRegisterSheet()
        assertFalse(viewModel.uiState.value.sheet.visible)

        viewModel.register()
        advanceUntilIdle()
        assertTrue(repository.registerCalls.isEmpty())
    }

    // ---- suggestion gating (ENR.23) -------------------------------------

    @Test
    fun `suggestion is not fetched for partial or invalid dates`() = runTest {
        val (repository, viewModel) = harness()
        viewModel.openRegisterSheet()

        viewModel.onBirthDateChange("10/06/20")
        advanceUntilIdle()
        assertEquals(SuggestionState.Idle, viewModel.uiState.value.sheet.suggestion)

        viewModel.onBirthDateChange("99/99/9999")
        advanceUntilIdle()
        assertEquals(SuggestionState.Idle, viewModel.uiState.value.sheet.suggestion)

        assertTrue(repository.suggestionCalls.isEmpty())
    }

    @Test
    fun `suggestion is fetched once the birth date is complete and valid`() = runTest {
        val (repository, viewModel) = harness()
        repository.suggestionResult = ApiResult.Success(suggestion(id = "class-kids"))
        viewModel.openRegisterSheet()

        viewModel.onBirthDateChange("10/06/2017")
        advanceUntilIdle()

        assertEquals(listOf("2017-06-10"), repository.suggestionCalls)
        val state = viewModel.uiState.value.sheet.suggestion
        assertTrue(state is SuggestionState.Found)
        assertTrue((state as SuggestionState.Found).accepted) // accepted by default
    }

    @Test
    fun `editing the date resets a fetched suggestion`() = runTest {
        val (repository, viewModel) = harness()
        repository.suggestionResult = ApiResult.Success(suggestion())
        viewModel.openRegisterSheet()
        viewModel.onBirthDateChange("10/06/2017")
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.sheet.suggestion is SuggestionState.Found)

        viewModel.onBirthDateChange("10/06/201")
        advanceUntilIdle()

        assertEquals(SuggestionState.Idle, viewModel.uiState.value.sheet.suggestion)
        assertEquals(1, repository.suggestionCalls.size)
    }

    @Test
    fun `no age-matching class shows the none state`() = runTest {
        val (repository, viewModel) = harness()
        repository.suggestionResult = ApiResult.Success(null)
        viewModel.openRegisterSheet()

        viewModel.onBirthDateChange("01/01/1990")
        advanceUntilIdle()

        assertEquals(SuggestionState.None, viewModel.uiState.value.sheet.suggestion)
    }

    // ---- cadastrar (ENR.23, stories 31-34) ------------------------------

    private fun registered(enrolled: Boolean) = ApiResult.Success(
        RegisterDependentResponse(dependent = dependent("d9", name = "Bia Andrade"), enrolled = enrolled),
    )

    @Test
    fun `register sends the accepted suggestion classId and reports enrollment`() = runTest {
        val (repository, viewModel) = harness()
        repository.suggestionResult = ApiResult.Success(suggestion(id = "class-kids"))
        repository.registerResult = registered(enrolled = true)
        viewModel.openRegisterSheet()
        viewModel.onFullNameChange("Bia Andrade")
        viewModel.onBirthDateChange("10/06/2017")
        advanceUntilIdle()

        viewModel.register()
        advanceUntilIdle()

        assertEquals(
            listOf(Triple("Bia Andrade", "2017-06-10", "class-kids")),
            repository.registerCalls,
        )
        val state = viewModel.uiState.value
        assertFalse(state.sheet.visible) // sheet resets on success
        assertEquals(RegisterSuccess("Bia Andrade", enrolled = true), state.success)
        assertTrue("panel refreshes after registering", repository.dependentsCalls >= 2)
    }

    @Test
    fun `register with declined suggestion omits the classId`() = runTest {
        val (repository, viewModel) = harness()
        repository.suggestionResult = ApiResult.Success(suggestion(id = "class-kids"))
        repository.registerResult = registered(enrolled = false)
        viewModel.openRegisterSheet()
        viewModel.onFullNameChange("Bia Andrade")
        viewModel.onBirthDateChange("10/06/2017")
        advanceUntilIdle()
        viewModel.toggleSuggestionAccepted()

        viewModel.register()
        advanceUntilIdle()

        assertNull(repository.registerCalls.single().third)
    }

    @Test
    fun `full suggested class still registers with pending enrollment`() = runTest {
        val (repository, viewModel) = harness()
        repository.suggestionResult = ApiResult.Success(suggestion(id = "class-kids"))
        repository.registerResult = registered(enrolled = false) // story 34
        viewModel.openRegisterSheet()
        viewModel.onFullNameChange("Bia Andrade")
        viewModel.onBirthDateChange("10/06/2017")
        advanceUntilIdle()

        viewModel.register()
        advanceUntilIdle()

        assertEquals(RegisterSuccess("Bia Andrade", enrolled = false), viewModel.uiState.value.success)
    }

    @Test
    fun `register validates name and date before calling the API`() = runTest {
        val (repository, viewModel) = harness()
        viewModel.openRegisterSheet()
        viewModel.onFullNameChange("   ")
        viewModel.onBirthDateChange("10/06")

        viewModel.register()
        advanceUntilIdle()

        assertEquals(R.string.register_validation, viewModel.uiState.value.sheet.errorRes)
        assertTrue(repository.registerCalls.isEmpty())
    }

    @Test
    fun `server-side permission denial maps to the disabled copy`() = runTest {
        val (repository, viewModel) = harness()
        repository.registerResult = ApiResult.Failure(ApiError.Auth.PermissionDisabled)
        viewModel.openRegisterSheet()
        viewModel.onFullNameChange("Bia Andrade")
        viewModel.onBirthDateChange("10/06/2017")
        advanceUntilIdle()

        viewModel.register()
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet
        assertTrue(sheet.visible) // stays open for the user to see the error
        assertFalse(sheet.submitting)
        assertEquals(R.string.error_permission_disabled, sheet.errorRes)
    }
}
