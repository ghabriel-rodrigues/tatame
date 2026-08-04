package br.com.tatame.feature.attendance.professor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentChip
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

/**
 * Chamada manual (ATT.21, professor-10 — the screenshot's all-disabled state
 * is a capture bug; this implements the specified active behavior): roster
 * with per-tap toggles applied immediately, "N presentes de M" header, manual
 * markers, self check-ins pre-toggled. "Salvar chamada" is pure navigation.
 */
@Composable
fun RollCallScreen(
    classId: String,
    className: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RollCallViewModel =
        koinViewModel(key = "roll-call-$classId") { parametersOf(classId) },
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S8)
                    .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
                    .clickable(onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "‹",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Column {
                Text(
                    text = stringResource(R.string.roll_call_title, className),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                (state as? RollCallState.Loaded)?.let { loaded ->
                    Text(
                        text = stringResource(
                            R.string.roll_call_count,
                            loaded.presentCount,
                            loaded.rows.size,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val rollCall = state) {
            is RollCallState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }

            is RollCallState.Error ->
                EnrollmentErrorState(messageRes = rollCall.messageRes, onRetry = viewModel::open)

            is RollCallState.Loaded -> {
                rollCall.noticeRes?.let {
                    Box(Modifier.clickable(onClick = viewModel::dismissNotice)) {
                        EnrollmentNotice(
                            text = stringResource(it),
                            containerColor = LumiraTokens.Colors.Danger100,
                        )
                    }
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                }

                if (rollCall.rows.isEmpty()) {
                    Text(
                        text = stringResource(R.string.roll_call_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
                        modifier = Modifier.weight(1f),
                    ) {
                        items(rollCall.rows, key = { it.studentId }) { row ->
                            RollCallRowCard(row = row, onToggle = { viewModel.toggle(row.studentId) })
                        }
                    }
                }

                Spacer(Modifier.height(LumiraTokens.Space.S4))
                Button(
                    onClick = onClose, // toggles are already applied per tap (story 32)
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.roll_call_save_cta))
                }
                Spacer(Modifier.height(LumiraTokens.Space.S6))
            }
        }
    }
}

@Composable
private fun RollCallRowCard(row: RollCallRow, onToggle: () -> Unit) {
    val toggleDescription = stringResource(R.string.roll_call_toggle_action, row.fullName)
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = LumiraTokens.Space.S3,
                vertical = LumiraTokens.Space.S2,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            AvatarBubble(fullName = row.fullName)
            Text(
                text = row.fullName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            if (row.manual && row.attendanceId != null) {
                EnrollmentChip(
                    text = stringResource(R.string.roll_call_manual_marker),
                    containerColor = LumiraTokens.Colors.Warning100,
                    contentColor = LumiraTokens.Colors.Fg2,
                )
            }
            PresenceToggle(
                present = row.attendanceId != null,
                pending = row.pending,
                contentDescription = toggleDescription,
                onToggle = onToggle,
            )
        }
    }
}

@Composable
private fun PresenceToggle(
    present: Boolean,
    pending: Boolean,
    contentDescription: String,
    onToggle: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(
                color = if (present) LumiraTokens.Colors.Success500 else LumiraTokens.Colors.BgSunken,
                shape = PillShape,
            )
            .border(
                width = 1.dp,
                color = if (present) LumiraTokens.Colors.Success500 else LumiraTokens.Colors.Border2,
                shape = PillShape,
            )
            .clickable(enabled = !pending, onClick = onToggle)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        when {
            pending -> CircularProgressIndicator(
                modifier = Modifier.size(LumiraTokens.Space.S4),
                color = if (present) LumiraTokens.Colors.FgOnColor else MaterialTheme.colorScheme.primary,
            )
            present -> Text(
                text = "✓",
                style = MaterialTheme.typography.labelSmall,
                color = LumiraTokens.Colors.FgOnColor,
            )
        }
    }
}
