package br.com.tatame.feature.attendance.professor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.CheckinMethods
import br.com.tatame.core.network.dto.SnapshotAttendance
import br.com.tatame.feature.attendance.QrCodeCanvas
import br.com.tatame.feature.enrollment.AvatarBubble
import br.com.tatame.feature.enrollment.EnrollmentChip
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import com.tatame.designsystem.tokens.LumiraTokens
import kotlinx.coroutines.delay
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

/**
 * Chamada ao vivo (ATT.20, professor-03): big 4-digit code, QR of the opaque
 * token, expiry countdown, live "N alunos já registraram presença" counter +
 * arriving list (SSE with polling fallback), Encerrar/Reabrir. Rendered as a
 * modal sheet over whichever surface opened it (dashboard hero or turma
 * detail).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveChamadaSheet(
    classId: String,
    className: String,
    onDismiss: () -> Unit,
    viewModel: LiveChamadaViewModel =
        koinViewModel(key = "live-$classId") { parametersOf(classId) },
) {
    val state by viewModel.uiState.collectAsState()

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
        ) {
            when (val chamada = state) {
                is LiveChamadaState.Loading -> CenteredLoading()
                is LiveChamadaState.Error -> EnrollmentErrorState(
                    messageRes = chamada.messageRes,
                    onRetry = viewModel::open,
                )
                is LiveChamadaState.Open -> OpenChamadaContent(
                    chamada = chamada,
                    className = className,
                    onEncerrar = viewModel::encerrar,
                )
                is LiveChamadaState.Closed -> ClosedChamadaContent(
                    presentCount = chamada.presentCount,
                    onReopen = viewModel::reopen,
                    onDismiss = onDismiss,
                )
            }
        }
    }
}

@Composable
private fun OpenChamadaContent(
    chamada: LiveChamadaState.Open,
    className: String,
    onEncerrar: () -> Unit,
) {
    Text(
        text = stringResource(R.string.live_chamada_title, className),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S1))
    Text(
        text = stringResource(R.string.live_chamada_subtitle),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S5))

    CodeDigitsRow(code = chamada.live.code)
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    ExpiryCountdown(expiresAtIso = chamada.live.expiresAt)
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    // QR of the opaque token — never the digits (spec 004).
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Surface(
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            color = LumiraTokens.Colors.White,
        ) {
            QrCodeCanvas(
                content = chamada.live.qrToken,
                modifier = Modifier.size(160.dp).padding(LumiraTokens.Space.S3),
            )
        }
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    Text(
        text = if (chamada.presentCount == 1) {
            stringResource(R.string.live_chamada_count_one)
        } else {
            stringResource(R.string.live_chamada_count, chamada.presentCount)
        },
        style = MaterialTheme.typography.labelSmall,
        color = LumiraTokens.Colors.Success500,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
    if (chamada.connection == LiveConnectionMode.POLLING) {
        Text(
            text = stringResource(R.string.live_chamada_polling),
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Fg4,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (chamada.arrivals.isNotEmpty()) {
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
            // Newest last (oldest first, per the snapshot contract); the sheet
            // shows the tail so the latest arrivals stay visible.
            chamada.arrivals.takeLast(MAX_VISIBLE_ARRIVALS).forEach { arrival ->
                ArrivalRow(arrival = arrival)
            }
        }
    }

    Spacer(Modifier.height(LumiraTokens.Space.S5))
    Button(
        onClick = onEncerrar,
        enabled = !chamada.closing,
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (chamada.closing) {
            CircularProgressIndicator(
                modifier = Modifier.size(LumiraTokens.Space.S4),
                color = LumiraTokens.Colors.FgOnColor,
            )
        } else {
            Text(stringResource(R.string.live_chamada_close_cta))
        }
    }
}

private const val MAX_VISIBLE_ARRIVALS = 8

@Composable
private fun CodeDigitsRow(code: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2, Alignment.CenterHorizontally),
    ) {
        code.forEach { digit ->
            Surface(
                shape = RoundedCornerShape(LumiraTokens.Radius.Sm),
                color = LumiraTokens.Colors.White,
                border = androidx.compose.foundation.BorderStroke(1.dp, LumiraTokens.Colors.Border1),
            ) {
                Box(
                    modifier = Modifier.width(44.dp).height(52.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "$digit",
                        style = MaterialTheme.typography.headlineMedium,
                        color = LumiraTokens.Colors.Fg1,
                    )
                }
            }
        }
    }
}

@Composable
private fun ExpiryCountdown(expiresAtIso: String) {
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(expiresAtIso) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val remaining = LiveChamadaViewModel.formatRemaining(expiresAtIso, nowMs)
    Text(
        text = if (remaining != null) {
            stringResource(R.string.live_chamada_expires, remaining)
        } else {
            stringResource(R.string.live_chamada_expired)
        },
        style = MaterialTheme.typography.labelSmall,
        color = if (remaining != null) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            LumiraTokens.Colors.Danger500
        },
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ArrivalRow(arrival: SnapshotAttendance) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        modifier = Modifier.fillMaxWidth(),
    ) {
        AvatarBubble(fullName = arrival.studentName, size = LumiraTokens.Space.S6)
        Text(
            text = arrival.studentName,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (arrival.method == CheckinMethods.MANUAL) {
            EnrollmentChip(
                text = stringResource(R.string.live_chamada_method_manual),
                containerColor = LumiraTokens.Colors.Warning100,
                contentColor = LumiraTokens.Colors.Fg2,
            )
        }
    }
}

@Composable
private fun ClosedChamadaContent(
    presentCount: Int,
    onReopen: () -> Unit,
    onDismiss: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.live_chamada_closed_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = stringResource(R.string.live_chamada_closed_body, presentCount),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S5))
        Button(
            onClick = onReopen,
            shape = PillShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = LumiraTokens.Colors.Gray100,
                contentColor = LumiraTokens.Colors.Fg2,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.live_chamada_reopen_cta))
        }
        Spacer(Modifier.height(LumiraTokens.Space.S2))
        Button(onClick = onDismiss, shape = PillShape, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.checkin_close))
        }
    }
}

@Composable
private fun CenteredLoading() {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}
