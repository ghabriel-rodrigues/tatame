package br.com.tatame.feature.graduation.aluno

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
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
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import br.com.tatame.R
import br.com.tatame.core.designsystem.components.BeltBar
import br.com.tatame.core.designsystem.components.BeltBarSize
import br.com.tatame.core.designsystem.components.BeltLogo
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.GraduationEntry
import br.com.tatame.feature.graduation.GraduationFormat
import br.com.tatame.feature.graduation.toBeltDisplay
import com.tatame.designsystem.tokens.LumiraTokens
import java.io.File
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Rendered belt-promotion certificate (REP.15, aluno-09): academy-branded
 * through the session theme (MaterialTheme carries the white-label palette),
 * belt drawn by the shared BeltBar — no hex literals. "Compartilhar" captures
 * the rendered card into a bitmap (Compose GraphicsLayer) and hands a PNG to
 * the OS share sheet — the lean v1 "download" (no PDF library; a real PDF
 * file is recorded debt alongside the reports one, spec 013 Out of Scope).
 */
@Composable
fun CertificateScreen(
    entry: GraduationEntry,
    studentName: String,
    academyName: String?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val graphicsLayer = rememberGraphicsLayer()
    val shareTitle = stringResource(R.string.certificate_share_subject, studentName)

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
        ) {
            CertificateBackBubble(onBack = onBack)
            Text(
                text = stringResource(R.string.certificate_screen_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S5))

        CertificateCard(
            entry = entry,
            studentName = studentName,
            academyName = academyName,
            // Records the card's draw commands so the share action can rasterize
            // exactly what is on screen.
            modifier = Modifier.drawWithContent {
                graphicsLayer.record { this@drawWithContent.drawContent() }
                drawLayer(graphicsLayer)
            },
        )

        Spacer(Modifier.height(LumiraTokens.Space.S5))
        Button(
            onClick = {
                scope.launch {
                    val bitmap = graphicsLayer.toImageBitmap().asAndroidBitmap()
                    shareCertificate(context, bitmap, shareTitle)
                }
            },
            shape = PillShape,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.certificate_share_cta))
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }
}

/** The branded certificate composition — also the exact share/print surface. */
@Composable
private fun CertificateCard(
    entry: GraduationEntry,
    studentName: String,
    academyName: String?,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier
            .fillMaxWidth()
            .border(
                width = 2.dp,
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            ),
    ) {
        Column(
            modifier = Modifier.padding(LumiraTokens.Space.S6),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BeltLogo(
                size = LumiraTokens.Space.S12,
                containerColor = MaterialTheme.colorScheme.primary,
                markColor = LumiraTokens.Colors.FgOnColor,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            academyName?.let {
                Text(
                    text = it.uppercase(Locale("pt", "BR")),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S4))
            }
            Text(
                text = stringResource(R.string.certificate_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))
            Text(
                text = stringResource(R.string.certificate_conferred),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = studentName,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))
            // The awarded belt, drawn by the shared BeltBar (0 degrees — a
            // promotion resets the ponteira, spec 005).
            BeltBar(
                belt = entry.belt.toBeltDisplay(degrees = 0),
                size = BeltBarSize.Lg,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = GraduationFormat.timelineTitle(entry.kind, entry.belt, entry.degree),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = GraduationFormat.fullDate(entry.awardedAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S6))
            // Professor signature line.
            HorizontalDivider(
                thickness = 1.dp,
                color = LumiraTokens.Colors.Border2,
                modifier = Modifier.width(LumiraTokens.Space.S24 + LumiraTokens.Space.S16),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = stringResource(R.string.graduacao_awarded_by, entry.awardedBy.fullName),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            academyName?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * PNG → cache/certificates → FileProvider URI → ACTION_SEND share sheet.
 * IO off the main thread; the chooser Intent carries read permission.
 */
private suspend fun shareCertificate(context: Context, bitmap: Bitmap, title: String) {
    val uri = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "certificates").apply { mkdirs() }
        val file = File(dir, "certificado-graduacao.png")
        file.outputStream().use { stream ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        }
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, title)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, title))
}

@Composable
private fun CertificateBackBubble(onBack: () -> Unit) {
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
