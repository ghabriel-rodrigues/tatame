package br.com.tatame.feature.billing.aluno

import androidx.compose.foundation.background
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.ChargeStatuses
import br.com.tatame.core.network.dto.ChargeWithPayments
import br.com.tatame.core.network.dto.HistoryEntry
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.PaymentStatuses
import br.com.tatame.core.network.dto.WalletRecurrence
import br.com.tatame.core.network.dto.WalletResponse
import br.com.tatame.feature.billing.BillingFormat
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.BoletoPaymentSheet
import br.com.tatame.feature.billing.CardPaymentSheet
import br.com.tatame.feature.billing.PaymentSuccessSheet
import br.com.tatame.feature.billing.PixPaymentSheet
import br.com.tatame.feature.billing.ReceiptSheet
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Aluno "Carteira" tab (BIL.19, aluno-12) replacing the Phase-2 shell: plan
 * header, mensalidade card with the Em aberto/Paga/Em atraso chip and the
 * three payment buttons, recurrence banner with cancel, Histórico with
 * comprovante, and the honest no-plan empty state. The payment sheets
 * (BIL.20, aluno-13/14/15) mount over this tab.
 */
@Composable
fun CarteiraTab(
    academyName: String?,
    modifier: Modifier = Modifier,
    viewModel: CarteiraViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = stringResource(R.string.carteira_title),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )

        when (val wallet = state.wallet) {
            is WalletState.Loading -> CenteredLoading()
            is WalletState.Error ->
                EnrollmentErrorState(messageRes = wallet.messageRes, onRetry = viewModel::refresh)
            is WalletState.Loaded -> CarteiraContent(
                wallet = wallet.wallet,
                creatingMethod = state.creatingMethod,
                actionErrorRes = state.actionErrorRes,
                cancelingMandate = state.cancelingMandate,
                onPayPix = viewModel::payWithPix,
                onPayBoleto = viewModel::payWithBoleto,
                onPayCard = viewModel::openCardSheet,
                onCancelRecurrence = viewModel::cancelRecurrence,
                onOpenReceipt = viewModel::openReceipt,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    when (val sheet = state.sheet) {
        null -> Unit
        is PaymentSheet.Pix -> PixPaymentSheet(
            sheet = sheet,
            contextName = academyName,
            onSimulate = viewModel::simulate,
            onDismiss = viewModel::dismissSheet,
        )
        is PaymentSheet.Boleto -> BoletoPaymentSheet(
            sheet = sheet,
            onSimulate = viewModel::simulate,
            onDismiss = viewModel::dismissSheet,
        )
        is PaymentSheet.Card -> CardPaymentSheet(
            sheet = sheet,
            onNumberChange = viewModel::updateCardNumber,
            onHolderChange = viewModel::updateCardHolder,
            onExpiryChange = viewModel::updateCardExpiry,
            onCvvChange = viewModel::updateCardCvv,
            onToggleRecurrence = viewModel::toggleRecurrence,
            onSubmit = viewModel::submitCard,
            onDismiss = viewModel::dismissSheet,
        )
        is PaymentSheet.Success ->
            PaymentSuccessSheet(sheet = sheet, onDismiss = viewModel::dismissSheet)
        is PaymentSheet.Receipt -> ReceiptSheet(sheet = sheet, onDismiss = viewModel::dismissSheet)
    }
}

@Composable
private fun CarteiraContent(
    wallet: WalletResponse,
    creatingMethod: String?,
    actionErrorRes: Int?,
    cancelingMandate: Boolean,
    onPayPix: () -> Unit,
    onPayBoleto: () -> Unit,
    onPayCard: () -> Unit,
    onCancelRecurrence: () -> Unit,
    onOpenReceipt: (String) -> Unit,
) {
    val plan = wallet.plan
    if (plan != null) {
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = BillingFormat.planHeader(plan),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    // No plan → clean empty state; billing never invents money (story 8).
    if (plan == null && wallet.currentCharge == null && wallet.history.isEmpty()) {
        EnrollmentNotice(text = stringResource(R.string.carteira_no_plan_empty))
        return
    }

    actionErrorRes?.let {
        EnrollmentNotice(
            text = stringResource(it),
            containerColor = LumiraTokens.Colors.Danger100,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))
    }

    val charge = wallet.currentCharge
    if (charge != null) {
        MensalidadeCard(
            charge = charge,
            creatingMethod = creatingMethod,
            onPayPix = onPayPix,
            onPayBoleto = onPayBoleto,
            onPayCard = onPayCard,
            onOpenReceipt = onOpenReceipt,
        )
    } else {
        EnrollmentNotice(text = stringResource(R.string.carteira_no_charge))
    }

    if (wallet.recurrence.active) {
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        RecurrenceBanner(
            recurrence = wallet.recurrence,
            canceling = cancelingMandate,
            onCancel = onCancelRecurrence,
        )
    }

    Spacer(Modifier.height(LumiraTokens.Space.S5))
    Text(
        text = stringResource(R.string.carteira_history_title),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    if (wallet.history.isEmpty()) {
        Text(
            text = stringResource(R.string.carteira_history_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
            wallet.history.forEach { entry ->
                HistoryRow(entry = entry, onOpenReceipt = onOpenReceipt)
            }
        }
    }
}

// ---- mensalidade card (aluno-12) ------------------------------------------

@Composable
private fun MensalidadeCard(
    charge: ChargeWithPayments,
    creatingMethod: String?,
    onPayPix: () -> Unit,
    onPayBoleto: () -> Unit,
    onPayCard: () -> Unit,
    onOpenReceipt: (String) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = BillingFormat.mensalidadeTitle(charge.periodStart),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                ChargeStatusChip(status = charge.status, overdue = charge.overdue)
            }
            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = BillingFormat.amountBRL(charge.amountCents),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))

            val settled = charge.settledPayment()
            if (settled != null) {
                // Paga treatment (story 15): paid line + comprovante.
                Text(
                    text = BillingFormat.paidLine(settled.paidAt, settled.method),
                    style = MaterialTheme.typography.bodySmall,
                    color = LumiraTokens.Colors.Success500,
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                OutlinedButton(
                    onClick = { onOpenReceipt(settled.id) },
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = stringResource(R.string.carteira_view_receipt),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            } else if (charge.payable()) {
                Text(
                    text = BillingFormat.dueLabel(charge.dueDate),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (charge.overdue) {
                        LumiraTokens.Colors.Danger500
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                PayButtons(
                    creatingMethod = creatingMethod,
                    onPayPix = onPayPix,
                    onPayBoleto = onPayBoleto,
                    onPayCard = onPayCard,
                )
            }
        }
    }
}

@Composable
private fun PayButtons(
    creatingMethod: String?,
    onPayPix: () -> Unit,
    onPayBoleto: () -> Unit,
    onPayCard: () -> Unit,
) {
    val busy = creatingMethod != null
    Button(
        onClick = onPayPix,
        enabled = !busy,
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (creatingMethod == PaymentMethods.PIX) {
            CircularProgressIndicator(
                modifier = Modifier.size(LumiraTokens.Space.S4),
                color = LumiraTokens.Colors.FgOnColor,
            )
        } else {
            Text(
                text = stringResource(R.string.carteira_pay_pix),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
    Spacer(Modifier.height(LumiraTokens.Space.S2))
    Row {
        OutlinedButton(
            onClick = onPayBoleto,
            enabled = !busy,
            shape = PillShape,
            modifier = Modifier.weight(1f),
        ) {
            if (creatingMethod == PaymentMethods.BOLETO) {
                CircularProgressIndicator(
                    modifier = Modifier.size(LumiraTokens.Space.S4),
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                Text(
                    text = stringResource(R.string.carteira_pay_boleto),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        Spacer(Modifier.width(LumiraTokens.Space.S2))
        OutlinedButton(
            onClick = onPayCard,
            enabled = !busy,
            shape = PillShape,
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = stringResource(R.string.carteira_pay_card),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

/** Em aberto (amber) / Paga (green) / Em atraso (red) / Estornada (gray). */
@Composable
internal fun ChargeStatusChip(status: String, overdue: Boolean) {
    val (labelRes, container, content) = when {
        status == ChargeStatuses.PAID ->
            Triple(
                R.string.carteira_status_paid,
                LumiraTokens.Colors.Success100,
                LumiraTokens.Colors.Success500,
            )
        status == ChargeStatuses.REFUNDED ->
            Triple(
                R.string.carteira_status_refunded,
                LumiraTokens.Colors.Gray100,
                LumiraTokens.Colors.Fg3,
            )
        overdue || status == ChargeStatuses.OVERDUE ->
            Triple(
                R.string.carteira_status_overdue,
                LumiraTokens.Colors.Danger100,
                LumiraTokens.Colors.Danger500,
            )
        else ->
            Triple(
                R.string.carteira_status_open,
                LumiraTokens.Colors.Warning100,
                LumiraTokens.Colors.Warning500,
            )
    }
    StatusChip(label = stringResource(labelRes), container = container, content = content)
}

@Composable
internal fun StatusChip(label: String, container: Color, content: Color) {
    Box(
        modifier = Modifier
            .background(color = container, shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S2, vertical = LumiraTokens.Space.S1),
    ) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = content)
    }
}

// ---- recurrence banner (stories 6/14) -------------------------------------

@Composable
private fun RecurrenceBanner(
    recurrence: WalletRecurrence,
    canceling: Boolean,
    onCancel: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = LumiraTokens.Colors.BrandTint,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S8)
                    .background(color = LumiraTokens.Colors.Purple500, shape = PillShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "↻",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = recurrence.nextChargeDueDate
                        ?.let {
                            stringResource(
                                R.string.carteira_recurrence_banner,
                                BillingFormat.longDate(it),
                            )
                        }
                        ?: stringResource(R.string.carteira_recurrence_banner_no_date),
                    style = MaterialTheme.typography.bodySmall,
                    color = LumiraTokens.Colors.Fg1,
                )
                TextButton(
                    onClick = onCancel,
                    enabled = !canceling,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                ) {
                    Text(
                        text = stringResource(R.string.carteira_recurrence_cancel),
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Purple700,
                    )
                }
            }
        }
    }
}

// ---- histórico ------------------------------------------------------------

@Composable
private fun HistoryRow(entry: HistoryEntry, onOpenReceipt: (String) -> Unit) {
    val refunded = entry.chargeStatus == ChargeStatuses.REFUNDED
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onOpenReceipt(entry.paymentId) },
    ) {
        Row(
            modifier = Modifier.padding(LumiraTokens.Space.S3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S8)
                    .background(
                        color = if (refunded) {
                            LumiraTokens.Colors.Gray100
                        } else {
                            LumiraTokens.Colors.Success100
                        },
                        shape = PillShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (refunded) "↩" else "✓",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (refunded) {
                        LumiraTokens.Colors.Fg3
                    } else {
                        LumiraTokens.Colors.Success500
                    },
                )
            }
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = BillingFormat.mensalidadeTitle(entry.periodStart),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (refunded) {
                        stringResource(R.string.carteira_status_refunded)
                    } else {
                        BillingFormat.paidLine(entry.paidAt, entry.method)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = BillingFormat.amountBRL(entry.amountCents),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

// ---- helpers --------------------------------------------------------------

/** The succeeded attempt of a settled charge (drives the Paga treatment). */
private fun ChargeWithPayments.settledPayment() =
    if (status == ChargeStatuses.PAID) {
        payments.lastOrNull { it.status == PaymentStatuses.SUCCEEDED }
    } else {
        null
    }

private fun ChargeWithPayments.payable(): Boolean =
    status == ChargeStatuses.OPEN || status == ChargeStatuses.OVERDUE

@Composable
private fun CenteredLoading() {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}
