package br.com.tatame.feature.store.vitrine

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.testutil.FakeStoreRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.productCard
import br.com.tatame.testutil.vitrineCategory
import br.com.tatame.testutil.vitrineResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * STO.12 — the shared aluno/professor vitrine state machine (spec 009 stories
 * 18–21): server-side search + category filter (cards carry no tags, client
 * filtering would lie), the "Tudo" chip semantics, in-flight cancellation and
 * the honest empty state.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoreVitrineViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val store = FakeStoreRepository()

    private fun viewModel() = StoreVitrineViewModel(store)

    private fun loaded(vm: StoreVitrineViewModel) =
        (vm.uiState.value.vitrine as VitrineState.Loaded).products

    // ---- load ------------------------------------------------------------

    @Test
    fun `initial load queries the unfiltered vitrine and fills the chip row`() = runTest {
        store.vitrineResult = ApiResult.Success(
            vitrineResponse(
                products = listOf(productCard(), productCard(id = "pr2", name = "Rash guard")),
                categories = listOf(vitrineCategory(), vitrineCategory("cat2", "Acessórios")),
            ),
        )
        val vm = viewModel()
        advanceUntilIdle()

        assertEquals(listOf<Pair<String?, String?>>(null to null), store.vitrineCalls)
        assertEquals(listOf("pr1", "pr2"), loaded(vm).map { it.id })
        assertEquals(
            listOf("Kimonos", "Acessórios"),
            vm.uiState.value.categories.map { it.name },
        )
    }

    @Test
    fun `load failure maps to PT-BR copy`() = runTest {
        store.vitrineResult = ApiResult.Failure(ApiError.Network)
        val vm = viewModel()
        advanceUntilIdle()

        val error = vm.uiState.value.vitrine as VitrineState.Error
        assertEquals(R.string.error_network, error.messageRes)
    }

    @Test
    fun `empty result is the honest empty state — never fabricated products`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse(products = emptyList()))
        val vm = viewModel()
        advanceUntilIdle()

        assertTrue(loaded(vm).isEmpty())
    }

    // ---- search (story 20: server query over name+tags) ------------------

    @Test
    fun `search re-queries the server trimmed`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.updateSearch("  kimono  ")
        advanceUntilIdle()

        assertEquals("kimono" to null, store.vitrineCalls.last())
        assertEquals("  kimono  ", vm.uiState.value.search) // raw text stays in the field
    }

    @Test
    fun `blank search queries unfiltered`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.updateSearch("   ")
        advanceUntilIdle()

        assertEquals(null to null, store.vitrineCalls.last())
    }

    @Test
    fun `a newer input cancels the in-flight fetch`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse())
        val vm = viewModel()

        // Neither the init fetch nor the first keystroke ran yet — the second
        // keystroke cancels both scheduled jobs before they hit the server.
        vm.updateSearch("k")
        vm.updateSearch("ki")
        advanceUntilIdle()

        assertEquals(listOf<Pair<String?, String?>>("ki" to null), store.vitrineCalls)
    }

    // ---- category chips (story 19: working carousel) ---------------------

    @Test
    fun `chip tap filters by category on the server`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.selectCategory("cat-kimonos")
        advanceUntilIdle()

        assertEquals(null to "cat-kimonos", store.vitrineCalls.last())
        assertEquals("cat-kimonos", vm.uiState.value.selectedCategoryId)
    }

    @Test
    fun `re-tapping the active chip resets to Tudo`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.selectCategory("cat-kimonos")
        advanceUntilIdle()
        vm.selectCategory("cat-kimonos")
        advanceUntilIdle()

        assertNull(vm.uiState.value.selectedCategoryId)
        assertEquals(null to null, store.vitrineCalls.last())
    }

    @Test
    fun `search and category compose on the same query`() = runTest {
        store.vitrineResult = ApiResult.Success(vitrineResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.selectCategory("cat-kimonos")
        advanceUntilIdle()
        vm.updateSearch("gi")
        advanceUntilIdle()

        assertEquals("gi" to "cat-kimonos", store.vitrineCalls.last())
    }
}
