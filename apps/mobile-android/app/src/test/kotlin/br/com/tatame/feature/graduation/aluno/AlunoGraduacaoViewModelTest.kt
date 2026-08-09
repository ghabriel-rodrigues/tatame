package br.com.tatame.feature.graduation.aluno

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.GraduationKinds
import br.com.tatame.testutil.FakeGraduationRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.alunoGraduation
import br.com.tatame.testutil.beltRef
import br.com.tatame.testutil.beltView
import br.com.tatame.testutil.graduationEntry
import br.com.tatame.testutil.graduationProgress
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** GRD.19 — aluno Graduação screen state over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class AlunoGraduacaoViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `load maps hero progress and timeline from the single response`() = runTest {
        val repository = FakeGraduationRepository()
        repository.alunoGraduationResult = ApiResult.Success(
            alunoGraduation(
                belt = beltView(degrees = 2),
                progress = graduationProgress(current = 26, target = 40),
                timeline = listOf(
                    graduationEntry(id = "g2", degree = 2),
                    graduationEntry(
                        id = "g1",
                        kind = GraduationKinds.BELT,
                        belt = beltRef(),
                        degree = 0,
                        certificateAvailable = true,
                        notes = "Exame de faixa — aprovado com distinção.",
                    ),
                ),
            ),
        )
        val viewModel = AlunoGraduacaoViewModel(repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state is AlunoGraduacaoState.Loaded)
        val data = (state as AlunoGraduacaoState.Loaded).data
        assertEquals(2, data.belt.degrees)
        assertEquals("Próximo 3º grau", data.progress.label)
        assertEquals(40, data.progress.target)
        assertEquals(listOf("g2", "g1"), data.timeline.map { it.id })
        assertTrue(data.timeline[1].certificateAvailable)
        assertEquals(1, repository.alunoGraduationCalls)
    }

    @Test
    fun `failure surfaces mapped PT-BR copy`() = runTest {
        val repository = FakeGraduationRepository()
        repository.alunoGraduationResult = ApiResult.Failure(ApiError.Network)
        val viewModel = AlunoGraduacaoViewModel(repository)
        advanceUntilIdle()

        assertEquals(
            AlunoGraduacaoState.Error(R.string.error_network),
            viewModel.uiState.value,
        )
    }

    @Test
    fun `refresh refetches after a failure`() = runTest {
        val repository = FakeGraduationRepository()
        repository.alunoGraduationResult = ApiResult.Failure(ApiError.Timeout)
        val viewModel = AlunoGraduacaoViewModel(repository)
        advanceUntilIdle()

        repository.alunoGraduationResult = ApiResult.Success(alunoGraduation())
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value is AlunoGraduacaoState.Loaded)
        assertEquals(2, repository.alunoGraduationCalls)
    }
}
