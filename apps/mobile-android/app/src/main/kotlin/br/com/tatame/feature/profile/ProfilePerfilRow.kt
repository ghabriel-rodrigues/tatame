package br.com.tatame.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * The aluno perfil "Dados pessoais" row (REP.13) — the Phase-1 stub finally
 * opens the real aluno-18 screen. Same row anatomy as the perfil Loja row.
 */
@Composable
fun ProfilePerfilRow(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth().clickable(onClick = onOpen),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S10)
                    .background(
                        color = LumiraTokens.Colors.Purple100,
                        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "☰",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiraTokens.Colors.Purple700,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.profile_perfil_row_title),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.profile_perfil_row_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Text(
                text = "›",
                style = MaterialTheme.typography.titleMedium,
                color = LumiraTokens.Colors.Fg3,
            )
        }
    }
}
