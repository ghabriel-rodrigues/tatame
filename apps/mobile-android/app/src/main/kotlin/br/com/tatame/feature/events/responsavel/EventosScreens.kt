package br.com.tatame.feature.events.responsavel

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.core.network.dto.ResponsavelEvent
import br.com.tatame.core.network.dto.ResponsavelEventDependent
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.PixPaymentSheet
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.events.EventFormat
import br.com.tatame.feature.events.EventValorChip
import br.com.tatame.feature.events.eventBannerBrush
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Responsável "Eventos" tab (EVT.13, responsavel-06) replacing the Phase-1
 * placeholder: published events as gradient-banner cards (valor chip over the
 * banner, name, data · hora · local line) with one chip per dependent —
 * confirmation is per child, per the charter. Tap semantics live in
 * [EventosViewModel]; the caption under the header surfaces the long-press
 * cancel affordance.
 */
@Composable
fun ResponsavelEventosTab(
    modifier: Modifier = Modifier,
    viewModel: EventosViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = stringResource(R.string.eventos_title),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = stringResource(R.string.eventos_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        state.actionErrorRes?.let {
            EnrollmentNotice(
                text = stringResource(it),
                containerColor = LumiraTokens.Colors.Danger100,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
        }

        when (val events = state.events) {
            is EventosState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }

            is EventosState.Error ->
                EnrollmentErrorState(messageRes = events.messageRes, onRetry = viewModel::refresh)

            is EventosState.Loaded -> {
                if (events.events.isEmpty()) {
                    EmptyEventsCard()
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
                        events.events.forEach { event ->
                            ResponsavelEventCard(
                                event = event,
                                actingStudentId = state.acting
                                    ?.takeIf { it.first == event.id }?.second,
                                onTapDependent = { studentId ->
                                    viewModel.tapDependent(event.id, studentId)
                                },
                                onLongPressDependent = { studentId ->
                                    viewModel.cancelDependent(event.id, studentId)
                                },
                            )
                        }
                    }
                    Spacer(Modifier.height(LumiraTokens.Space.S3))
                    Text(
                        text = stringResource(R.string.eventos_chip_cancel_hint),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    (state.sheet as? PaymentSheet.Pix)?.let { sheet ->
        PixPaymentSheet(
            sheet = sheet,
            contextName = null, // subtitle override carries "Inscrição · <evento> · <criança>"
            onSimulate = viewModel::simulate,
            onDismiss = viewModel::dismissSheet,
        )
    }
}

// ---- gradient card with per-dependent chips (responsavel-06) --------------

@Composable
private fun ResponsavelEventCard(
    event: ResponsavelEvent,
    actingStudentId: String?,
    onTapDependent: (String) -> Unit,
    onLongPressDependent: (String) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            // Banner strip: gradient preset, valor chip top-right, name bottom-left.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        brush = eventBannerBrush(event.bannerPreset),
                        shape = RoundedCornerShape(
                            topStart = LumiraTokens.Radius.Lg,
                            topEnd = LumiraTokens.Radius.Lg,
                        ),
                    )
                    .padding(LumiraTokens.Space.S3),
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    EventValorChip(
                        priceCents = event.priceCents,
                        modifier = Modifier.align(Alignment.End),
                    )
                    Spacer(Modifier.height(LumiraTokens.Space.S2))
                    Text(
                        text = event.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = LumiraTokens.Colors.FgOnColor,
                    )
                }
            }
            Column(modifier = Modifier.padding(LumiraTokens.Space.S3)) {
                Text(
                    text = EventFormat.dateTimeLocationLine(
                        date = event.date,
                        time = event.time,
                        location = event.location,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
                    event.dependents.forEach { dependent ->
                        DependentChip(
                            dependent = dependent,
                            acting = dependent.studentId == actingStudentId,
                            onTap = { onTapDependent(dependent.studentId) },
                            onLongPress = { onLongPressDependent(dependent.studentId) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

/**
 * One dependent chip (responsavel-06): outline pill with the child's first
 * name; confirmed → purple fill with the check; pending payment → amber
 * outline with the clock. Pedro confirmed never implies Júlia confirmed —
 * each chip renders its own registration row (spec story 21).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DependentChip(
    dependent: ResponsavelEventDependent,
    acting: Boolean,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val status = dependent.registration?.status
        ?.takeIf { it != EventRegistrationStatuses.CANCELED }
    val confirmed = status == EventRegistrationStatuses.CONFIRMED
    val pending = status == EventRegistrationStatuses.PENDING_PAYMENT
    val container = when {
        confirmed -> LumiraTokens.Colors.Purple700
        pending -> LumiraTokens.Colors.Warning100
        else -> MaterialTheme.colorScheme.surface
    }
    val content = when {
        confirmed -> LumiraTokens.Colors.FgOnColor
        pending -> LumiraTokens.Colors.Warning500
        else -> LumiraTokens.Colors.Fg2
    }
    Box(
        modifier = modifier
            .background(color = container, shape = PillShape)
            .border(
                width = 1.dp,
                color = if (confirmed) LumiraTokens.Colors.Purple700 else LumiraTokens.Colors.Border1,
                shape = PillShape,
            )
            .combinedClickable(onClick = onTap, onLongClick = onLongPress)
            .padding(vertical = LumiraTokens.Space.S2, horizontal = LumiraTokens.Space.S3),
        contentAlignment = Alignment.Center,
    ) {
        if (acting) {
            CircularProgressIndicator(
                modifier = Modifier.height(LumiraTokens.Space.S4),
                color = content,
            )
        } else {
            Text(
                text = buildString {
                    if (confirmed) append("✓ ")
                    if (pending) append("◷ ")
                    append(dependent.fullName.substringBefore(' '))
                },
                style = MaterialTheme.typography.labelSmall,
                color = content,
            )
        }
    }
}

@Composable
private fun EmptyEventsCard() {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = stringResource(R.string.eventos_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S5),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}
