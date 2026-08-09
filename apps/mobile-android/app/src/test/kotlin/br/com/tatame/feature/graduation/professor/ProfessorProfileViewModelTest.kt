package br.com.tatame.feature.graduation.professor

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.testutil.FakeGraduationRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.professorProfile
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** GRD.20 — professor own profile: belt chip + Graduações válidas (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfessorProfileViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `load exposes belt chip and the merged régua with kids toggles`() = runTest {
        val repository = FakeGraduationRepository()
        repository.professorProfileResult = ApiResult.Success(
            professorProfile(
                validGraduations = professorProfile().validGraduations.map {
                    if (it.beltId == "b-orange") it.copy(enabled = false) else it
                },
            ),
        )
        val viewModel = ProfessorProfileViewModel(repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state is ProfessorProfileState.Loaded)
        val profile = (state as ProfessorProfileState.Loaded).profile
        assertEquals("Preta", profile.belt?.name)
        assertEquals(2, profile.belt?.degrees)
        // Handoff régua order preserved; the disabled kids belt stays listed (dimmed).
        assertEquals("b-white", profile.validGraduations.first().beltId)
        assertEquals(
            listOf("b-orange"),
            profile.validGraduations.filter { !it.enabled }.map { it.beltId },
        )
    }

    @Test
    fun `belt chip is absent when the membership rank is unset`() = runTest {
        val repository = FakeGraduationRepository()
        repository.professorProfileResult = ApiResult.Success(professorProfile(belt = null))
        val viewModel = ProfessorProfileViewModel(repository)
        advanceUntilIdle()

        assertNull((viewModel.uiState.value as ProfessorProfileState.Loaded).profile.belt)
    }

    @Test
    fun `failure surfaces mapped PT-BR copy and refresh recovers`() = runTest {
        val repository = FakeGraduationRepository()
        repository.professorProfileResult = ApiResult.Failure(ApiError.Network)
        val viewModel = ProfessorProfileViewModel(repository)
        advanceUntilIdle()
        assertEquals(
            ProfessorProfileState.Error(R.string.error_network),
            viewModel.uiState.value,
        )

        repository.professorProfileResult = ApiResult.Success(professorProfile())
        viewModel.refresh()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value is ProfessorProfileState.Loaded)
    }
}
