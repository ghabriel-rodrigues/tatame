package br.com.tatame.feature.graduation.aluno

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltChip
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toBeltDisplay
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno Perfil tab (GRD.19, story 7): the real derived belt chip replaces the
 * shell placeholder — full profile management is a later slice, so only the
 * identity block + belt + logout render (never faked).
 */
@Composable
fun AlunoPerfilTab(
    fullName: String,
    academyName: String?,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AlunoGraduacaoViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier.fillMaxSize(),
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
        academyName?.let {
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S3))

        when (val loaded = state) {
            is AlunoGraduacaoState.Loading -> CircularProgressIndicator(
                modifier = Modifier.padding(LumiraTokens.Space.S2),
                color = MaterialTheme.colorScheme.primary,
            )
            is AlunoGraduacaoState.Error ->
                EnrollmentErrorState(messageRes = loaded.messageRes, onRetry = viewModel::refresh)
            is AlunoGraduacaoState.Loaded -> Box {
                BeltChip(
                    label = GraduationFormat.chipLabel(loaded.data.belt),
                    belt = loaded.data.belt.toBeltDisplay(),
                )
            }
        }

        Spacer(Modifier.weight(1f))
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
