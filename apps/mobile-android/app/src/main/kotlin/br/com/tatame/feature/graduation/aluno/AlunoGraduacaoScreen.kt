package br.com.tatame.feature.graduation.aluno

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltBar
import br.com.tatame.core.designsystem.components.BeltBarLayout
import br.com.tatame.core.designsystem.components.BeltBarSize
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.AlunoGraduationResponse
import br.com.tatame.core.network.dto.GraduationEntry
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toBeltDisplay
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno Graduação screen (GRD.19, aluno-09): purple hero card with the drawn
 * belt and its degrees, the progress bar toward the academy-rule target, and
 * the "Histórico de evolução" timeline. "Ver certificado" is REAL since
 * REP.15 — belt-promotion entries open the rendered certificate view
 * ([studentName]/[academyName] compose the branded certificate).
 */
@Composable
fun AlunoGraduacaoScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    studentName: String? = null,
    academyName: String? = null,
    viewModel: AlunoGraduacaoViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var certificateEntry by remember { mutableStateOf<GraduationEntry?>(null) }

    // REP.15 — the timeline's "Ver certificado" pushes the certificate view.
    certificateEntry?.let { entry ->
        CertificateScreen(
            entry = entry,
            studentName = studentName.orEmpty(),
            academyName = academyName,
            onBack = { certificateEntry = null },
            modifier = modifier,
        )
        return
    }

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            BackBubble(onBack = onBack)
            Text(
                text = stringResource(R.string.graduacao_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val loaded = state) {
            is AlunoGraduacaoState.Loading -> CenteredLoading()
            is AlunoGraduacaoState.Error ->
                EnrollmentErrorState(messageRes = loaded.messageRes, onRetry = viewModel::refresh)
            is AlunoGraduacaoState.Loaded -> GraduacaoContent(
                data = loaded.data,
                onOpenCertificate = { certificateEntry = it },
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }
}

@Composable
private fun GraduacaoContent(
    data: AlunoGraduationResponse,
    onOpenCertificate: (GraduationEntry) -> Unit,
) {
    GraduacaoHeroCard(data = data)
    Spacer(Modifier.height(LumiraTokens.Space.S5))
    Text(
        text = stringResource(R.string.graduacao_timeline_title),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
        data.timeline.forEach { entry ->
            TimelineRow(entry = entry, onOpenCertificate = onOpenCertificate)
        }
    }
}

// ---- hero (aluno-09 top card) --------------------------------------------

@Composable
private fun GraduacaoHeroCard(data: AlunoGraduationResponse) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(LumiraTokens.Colors.Purple700, LumiraTokens.Colors.Purple500),
                ),
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            )
            .padding(LumiraTokens.Space.S4),
    ) {
        Column {
            Text(
                text = stringResource(R.string.graduacao_current_belt).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = LumiraTokens.Colors.Purple200,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = GraduationFormat.heroTitle(data.belt),
                style = MaterialTheme.typography.headlineMedium,
                color = LumiraTokens.Colors.FgOnColor,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            BeltBar(
                belt = data.belt.toBeltDisplay(),
                size = BeltBarSize.Lg,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = data.progress.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.Purple200,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = GraduationFormat.lessonsLabel(data.progress.current, data.progress.target),
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            LinearProgressIndicator(
                progress = {
                    GraduationFormat.progressFraction(data.progress.current, data.progress.target)
                },
                modifier = Modifier.fillMaxWidth(),
                color = LumiraTokens.Colors.White,
                trackColor = LumiraTokens.Colors.Purple600,
            )
        }
    }
}

// ---- timeline (Histórico de evolução) ------------------------------------

@Composable
private fun TimelineRow(entry: GraduationEntry, onOpenCertificate: (GraduationEntry) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
        // Timeline marker: the entry's belt color; dimmed when reversed.
        Box(
            modifier = Modifier
                .padding(top = LumiraTokens.Space.S1)
                .size(LumiraTokens.Space.S3)
                .alpha(if (entry.reversed) 0.4f else 1f)
                .background(
                    color = BeltBarLayout.barColorOrFallback(entry.belt.colorSlug),
                    shape = PillShape,
                )
                .border(1.dp, LumiraTokens.Colors.BeltOutline, PillShape),
        )
        TimelineCard(
            entry = entry,
            onOpenCertificate = onOpenCertificate,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun TimelineCard(
    entry: GraduationEntry,
    onOpenCertificate: (GraduationEntry) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.alpha(if (entry.reversed) 0.55f else 1f),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = GraduationFormat.timelineTitle(entry.kind, entry.belt, entry.degree),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = GraduationFormat.monthYear(entry.awardedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = stringResource(R.string.graduacao_awarded_by, entry.awardedBy.fullName),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            entry.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                Spacer(Modifier.height(LumiraTokens.Space.S1))
                Text(
                    text = "“$notes”",
                    style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // REP.15 — the placeholder debt paid: belt promotions open the
            // rendered certificate (degree/revocation entries keep no button).
            if (GraduationFormat.certificateUnlocked(
                    kind = entry.kind,
                    certificateAvailable = entry.certificateAvailable,
                    reversed = entry.reversed,
                )
            ) {
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                CertificatePill(onClick = { onOpenCertificate(entry) })
            }
        }
    }
}

/** "Ver certificado" — real since REP.15 (was the Phase-5 render-only placeholder). */
@Composable
private fun CertificatePill(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .border(width = 1.dp, color = LumiraTokens.Colors.Purple300, shape = PillShape)
            .clickable(onClick = onClick)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = stringResource(R.string.graduacao_certificate_cta),
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Purple700,
        )
    }
}

// ---- shared bits ---------------------------------------------------------

@Composable
private fun BackBubble(onBack: () -> Unit) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
            .clickable(onClick = onBack),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "‹",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
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
