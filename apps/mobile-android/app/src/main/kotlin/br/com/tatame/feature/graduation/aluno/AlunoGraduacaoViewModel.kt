package br.com.tatame.feature.graduation.aluno

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.graduation.GraduationRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoGraduationResponse
import br.com.tatame.feature.graduation.toGraduationMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Graduação screen load state (GRD.19, aluno-09). */
sealed interface AlunoGraduacaoState {
    data object Loading : AlunoGraduacaoState
    data class Error(@param:StringRes val messageRes: Int) : AlunoGraduacaoState
    data class Loaded(val data: AlunoGraduationResponse) : AlunoGraduacaoState
}

/**
 * Aluno Graduação (GRD.19): one GET /v1/aluno/graduation feeding the hero
 * (derived belt), the progress bar (academy-rule target, "Próxima faixa" at
 * max degrees — both server-derived), and the Histórico de evolução timeline.
 * Also backs the aluno Perfil belt chip (same derived belt, story 7).
 */
class AlunoGraduacaoViewModel(private val repository: GraduationRepository) : ViewModel() {

    private val _uiState = MutableStateFlow<AlunoGraduacaoState>(AlunoGraduacaoState.Loading)
    val uiState: StateFlow<AlunoGraduacaoState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.value = AlunoGraduacaoState.Loading
        viewModelScope.launch {
            _uiState.value = when (val result = repository.alunoGraduation()) {
                is ApiResult.Success -> AlunoGraduacaoState.Loaded(result.value)
                is ApiResult.Failure ->
                    AlunoGraduacaoState.Error(result.error.toGraduationMessageRes())
            }
        }
    }
}
