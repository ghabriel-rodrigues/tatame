package br.com.tatame.feature.store.vitrine

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ProductCard
import br.com.tatame.core.network.dto.VitrineCategory
import br.com.tatame.core.store.StoreRepository
import br.com.tatame.feature.store.toStoreMessageRes
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Vitrine grid load state (STO.12, aluno-16/professor-13). */
sealed interface VitrineState {
    data object Loading : VitrineState
    data class Error(@param:StringRes val messageRes: Int) : VitrineState

    /** Empty list = the honest empty state — the vitrine never fabricates products. */
    data class Loaded(val products: List<ProductCard>) : VitrineState
}

data class StoreVitrineUiState(
    val search: String = "",
    /** "Tudo" + one chip per category — the WORKING carousel (spec story 19). */
    val categories: List<VitrineCategory> = emptyList(),
    /** null = "Tudo" selected. */
    val selectedCategoryId: String? = null,
    val vitrine: VitrineState = VitrineState.Loading,
)

/**
 * Shared aluno/professor vitrine (STO.12, spec 009 stories 18–21): search over
 * name+tags and the category filter are SERVER queries (`?search=` /
 * `?categoryId=`) — cards carry no tags, so client-side filtering would lie.
 * Each input change re-queries, canceling the in-flight fetch so a slow
 * response never overwrites a newer filter. Categories refresh with every
 * response (the chip row is carousel data of the same contract).
 */
class StoreVitrineViewModel(private val repository: StoreRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(StoreVitrineUiState())
    val uiState: StateFlow<StoreVitrineUiState> = _uiState.asStateFlow()

    private var fetchJob: Job? = null

    init {
        refresh()
    }

    fun refresh() = fetch()

    /** "Buscar por nome ou tag" — every keystroke narrows via the server. */
    fun updateSearch(raw: String) {
        _uiState.update { it.copy(search = raw) }
        fetch()
    }

    /** Chip tap: `null` = "Tudo". Tapping the active chip resets to "Tudo". */
    fun selectCategory(categoryId: String?) {
        _uiState.update {
            it.copy(
                selectedCategoryId = categoryId.takeIf { id -> id != it.selectedCategoryId },
            )
        }
        fetch()
    }

    private fun fetch() {
        fetchJob?.cancel()
        _uiState.update { it.copy(vitrine = VitrineState.Loading) }
        fetchJob = viewModelScope.launch {
            val state = _uiState.value
            val result = repository.vitrine(
                search = state.search.trim().ifEmpty { null },
                categoryId = state.selectedCategoryId,
            )
            _uiState.update {
                when (result) {
                    is ApiResult.Success -> it.copy(
                        vitrine = VitrineState.Loaded(result.value.products),
                        categories = result.value.categories,
                    )
                    is ApiResult.Failure -> it.copy(
                        vitrine = VitrineState.Error(result.error.toStoreMessageRes()),
                    )
                }
            }
        }
    }
}
