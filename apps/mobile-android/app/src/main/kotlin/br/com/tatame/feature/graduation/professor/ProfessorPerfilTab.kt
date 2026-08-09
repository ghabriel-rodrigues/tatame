package br.com.tatame.feature.graduation.professor

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltChip
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.graduation.GraduationRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ProfessorProfileResponse
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toBeltDisplay
import br.com.tatame.feature.graduation.toGraduationMessageRes
import com.tatame.designsystem.tokens.LumiraTokens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

/** Professor own-profile load state (GRD.20, professor-12). */
sealed interface ProfessorProfileState {
    data object Loading : ProfessorProfileState
    data class Error(@param:StringRes val messageRes: Int) : ProfessorProfileState
    data class Loaded(val profile: ProfessorProfileResponse) : ProfessorProfileState
}

/** One GET /v1/professor/profile: belt chip + Graduações válidas (merged régua). */
class ProfessorProfileViewModel(private val repository: GraduationRepository) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfessorProfileState>(ProfessorProfileState.Loading)
    val uiState: StateFlow<ProfessorProfileState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.value = ProfessorProfileState.Loading
        viewModelScope.launch {
            _uiState.value = when (val result = repository.professorProfile()) {
                is ApiResult.Success -> ProfessorProfileState.Loaded(result.value)
                is ApiResult.Failure ->
                    ProfessorProfileState.Error(result.error.toGraduationMessageRes())
            }
        }
    }
}

/**
 * Professor Perfil tab (GRD.20, professor-12): own belt chip (display-only
 * membership rank — hidden when unset) and the "Graduações válidas" card
 * rendering the merged régua as belt chips, kids belts dimmed when the admin
 * toggled them off. Convite por link stays with the invites slice.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfessorPerfilTab(
    fullName: String,
    academyName: String?,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProfessorProfileViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(LumiraTokens.Space.S8))
        AvatarBubble(
            fullName = fullName,
            size = LumiraTokens.Space.S16,
            containerColor = LumiraTokens.Colors.Purple500,
            contentColor = LumiraTokens.Colors.FgOnColor,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Text(
            text = fullName,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = academyName
                ?.let { stringResource(R.string.professor_profile_subtitle, it) }
                ?: stringResource(R.string.role_professor),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        when (val loaded = state) {
            is ProfessorProfileState.Loading -> {
                Spacer(Modifier.height(LumiraTokens.Space.S6))
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            is ProfessorProfileState.Error -> {
                Spacer(Modifier.height(LumiraTokens.Space.S4))
                EnrollmentErrorState(messageRes = loaded.messageRes, onRetry = viewModel::refresh)
            }
            is ProfessorProfileState.Loaded -> {
                loaded.profile.belt?.let { belt ->
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                    BeltChip(
                        label = GraduationFormat.chipLabel(belt),
                        belt = belt.toBeltDisplay(),
                    )
                }
                Spacer(Modifier.height(LumiraTokens.Space.S6))
                ValidGraduationsCard(profile = loaded.profile)
            }
        }

        Spacer(Modifier.height(LumiraTokens.Space.S8))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            shape = PillShape,
        ) {
            Text(stringResource(R.string.shell_logout))
        }
        Spacer(Modifier.height(LumiraTokens.Space.S6))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ValidGraduationsCard(profile: ProfessorProfileResponse) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            Text(
                text = stringResource(R.string.professor_profile_valid_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.professor_profile_valid_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
                verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
            ) {
                profile.validGraduations.forEach { belt ->
                    Box {
                        BeltChip(
                            label = belt.name,
                            belt = belt.toBeltDisplay(),
                            enabled = belt.enabled,
                        )
                    }
                }
            }
        }
    }
}
