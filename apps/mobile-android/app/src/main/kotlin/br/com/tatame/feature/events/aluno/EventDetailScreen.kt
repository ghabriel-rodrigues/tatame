package br.com.tatame.feature.events.aluno

import androidx.compose.foundation.background
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
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.AlunoEventDetailResponse
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.PixPaymentSheet
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.events.BannerBackBubble
import br.com.tatame.feature.events.EventFormat
import br.com.tatame.feature.events.EventValorChip
import br.com.tatame.feature.events.eventBannerBrush
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

/**
 * Aluno event detail (EVT.12, aluno-10): gradient banner with the back bubble,
 * valor chip and event name; info card (data · hora, local, "Responsável:
 * Prof. …"); description; and the single CTA driven by the
 * [EventFormat.detailCta] state machine — "Confirmar presença" (free),
 * "Pagar inscrição · R$ X" (paid, opening the EXISTING Pix sheet + gated
 * simulate), "Cancelar participação" (free confirmed / paid pending), or the
 * green "Presença confirmada — até lá!" banner. A paid confirmed registration
 * renders the banner with no cancel affordance (admin refund only).
 */
@Composable
fun EventDetailScreen(
    eventId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: EventDetailViewModel = koinViewModel(key = "event-$eventId") {
        parametersOf(eventId)
    },
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        when (val detail = state.detail) {
            is EventDetailState.Loading -> {
                BannerBackBubble(onBack = onBack)
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }

            is EventDetailState.Error -> {
                BannerBackBubble(onBack = onBack)
                EnrollmentErrorState(messageRes = detail.messageRes, onRetry = viewModel::refresh)
            }

            is EventDetailState.Loaded -> EventDetailContent(
                event = detail.event,
                acting = state.acting,
                actionErrorRes = state.actionErrorRes,
                onBack = onBack,
                onConfirm = viewModel::confirm,
                onPay = viewModel::pay,
                onCancel = viewModel::cancel,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    (state.sheet as? PaymentSheet.Pix)?.let { sheet ->
        PixPaymentSheet(
            sheet = sheet,
            contextName = null, // the "Inscrição · <evento>" subtitle override addresses it
            onSimulate = viewModel::simulate,
            onDismiss = viewModel::dismissSheet,
        )
    }
}

@Composable
private fun EventDetailContent(
    event: AlunoEventDetailResponse,
    acting: Boolean,
    actionErrorRes: Int?,
    onBack: () -> Unit,
    onConfirm: () -> Unit,
    onPay: () -> Unit,
    onCancel: () -> Unit,
) {
    // ---- gradient banner (preset slug → Lumira gradient) -----------------
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                brush = eventBannerBrush(event.bannerPreset),
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            )
            .padding(LumiraTokens.Space.S4),
    ) {
        Column {
            BannerBackBubble(onBack = onBack)
            Spacer(Modifier.height(LumiraTokens.Space.S6))
            EventValorChip(priceCents = event.priceCents)
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = event.name,
                style = MaterialTheme.typography.headlineMedium,
                color = LumiraTokens.Colors.FgOnColor,
            )
        }
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    // ---- info card (data/hora · local · responsável) ---------------------
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(LumiraTokens.Space.S4),
            verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        ) {
            InfoRow(
                glyph = "▤",
                text = listOfNotNull(EventFormat.longDayDate(event.date), event.time)
                    .joinToString(" · "),
            )
            event.location?.let { InfoRow(glyph = "◎", text = it) }
            InfoRow(
                glyph = "✦",
                text = stringResource(
                    R.string.event_responsible_line,
                    event.responsible.fullName,
                ),
            )
        }
    }

    event.description?.let {
        Spacer(Modifier.height(LumiraTokens.Space.S4))
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    actionErrorRes?.let {
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        EnrollmentNotice(
            text = stringResource(it),
            containerColor = LumiraTokens.Colors.Danger100,
        )
    }

    Spacer(Modifier.height(LumiraTokens.Space.S5))

    // ---- CTA state machine (free/paid × none/pending/confirmed) ----------
    when (EventFormat.detailCta(event.priceCents, event.registration?.status)) {
        EventFormat.DetailCta.CONFIRM -> PrimaryCta(
            label = stringResource(R.string.event_confirm_cta),
            acting = acting,
            onClick = onConfirm,
        )

        EventFormat.DetailCta.PAY -> {
            if (EventFormat.showPendingCancel(event.priceCents, event.registration?.status)) {
                EnrollmentNotice(
                    text = stringResource(R.string.event_pending_notice),
                    containerColor = LumiraTokens.Colors.Warning100,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
            }
            PrimaryCta(
                label = stringResource(
                    R.string.event_pay_cta,
                    EventFormat.compactBRL(event.priceCents ?: 0L),
                ),
                acting = acting,
                onClick = onPay,
            )
            if (EventFormat.showPendingCancel(event.priceCents, event.registration?.status)) {
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                CancelCta(acting = acting, onClick = onCancel)
            }
        }

        EventFormat.DetailCta.CANCEL -> {
            ConfirmedBanner()
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            CancelCta(acting = acting, onClick = onCancel)
        }

        // Paid + confirmed: banner only — the audited admin refund is the
        // sole way back (spec 008, documented UX choice).
        EventFormat.DetailCta.NONE -> ConfirmedBanner()
    }
}

@Composable
private fun InfoRow(glyph: String, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = glyph,
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Purple500,
        )
        Spacer(Modifier.width(LumiraTokens.Space.S2))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** Green "Presença confirmada — até lá!" banner (spec story 12). */
@Composable
private fun ConfirmedBanner() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.Success100,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .padding(LumiraTokens.Space.S3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "✓",
                style = MaterialTheme.typography.titleMedium,
                color = LumiraTokens.Colors.Success500,
            )
            Spacer(Modifier.width(LumiraTokens.Space.S2))
            Text(
                text = stringResource(R.string.event_confirmed_banner),
                style = MaterialTheme.typography.bodyMedium,
                color = LumiraTokens.Colors.Fg1,
            )
        }
    }
}

@Composable
private fun PrimaryCta(label: String, acting: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !acting,
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (acting) {
            CircularProgressIndicator(
                modifier = Modifier.size(LumiraTokens.Space.S4),
                color = LumiraTokens.Colors.FgOnColor,
            )
        } else {
            Text(label)
        }
    }
}

@Composable
private fun CancelCta(acting: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = !acting,
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = stringResource(R.string.event_cancel_cta),
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
