package br.com.tatame.feature.enrollment

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import com.tatame.designsystem.tokens.LumiraTokens

/** Small pill chip (age range, occupancy, Lotada badge) per the handoff cards. */
@Composable
internal fun EnrollmentChip(
    text: String,
    containerColor: Color,
    contentColor: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .background(color = containerColor, shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S2, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = contentColor,
        )
    }
}

/** Initials avatar bubble (roster rows, dependent cards). */
@Composable
internal fun AvatarBubble(
    fullName: String,
    modifier: Modifier = Modifier,
    size: Dp = LumiraTokens.Space.S8,
    containerColor: Color = LumiraTokens.Colors.Purple100,
    contentColor: Color = LumiraTokens.Colors.Purple700,
) {
    Box(
        modifier = modifier
            .size(size)
            .background(color = containerColor, shape = PillShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = ScheduleFormat.initials(fullName),
            style = MaterialTheme.typography.labelSmall,
            color = contentColor,
        )
    }
}

/** Section-level error with retry (list/detail load failures). */
@Composable
internal fun EnrollmentErrorState(
    messageRes: Int,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S6),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
    ) {
        Text(
            text = stringResource(messageRes),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(onClick = onRetry) {
            Text(stringResource(R.string.turmas_retry))
        }
    }
}

/** Inline notice card (success/action errors) reusing the login notice look. */
@Composable
internal fun EnrollmentNotice(
    text: String,
    modifier: Modifier = Modifier,
    containerColor: Color = LumiraTokens.Colors.BrandTint,
    contentColor: Color = LumiraTokens.Colors.Fg1,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(color = containerColor, shape = RoundedCornerShape(LumiraTokens.Radius.Md))
            .padding(LumiraTokens.Space.S3),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = contentColor,
        )
    }
}
