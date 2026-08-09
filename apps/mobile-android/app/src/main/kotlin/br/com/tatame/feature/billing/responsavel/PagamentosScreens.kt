package br.com.tatame.feature.billing.responsavel

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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.ChargeStatuses
import br.com.tatame.core.network.dto.DependentPayments
import br.com.tatame.core.network.dto.GuardianHistoryEntry
import br.com.tatame.core.network.dto.GuardianPaymentsResponse
import br.com.tatame.core.network.dto.PaymentStatuses
import br.com.tatame.feature.billing.BillingFormat
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.PaymentSuccessSheet
import br.com.tatame.feature.billing.PixPaymentSheet
import br.com.tatame.feature.billing.ReceiptSheet
import br.com.tatame.feature.billing.aluno.ChargeStatusChip
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Responsável "Pagamentos" tab (BIL.21, responsavel-04) replacing the shell
 * placeholder: one mensalidade card per dependent (plan subtitle, Em
 * aberto/Paga chip, "Pagar com Pix" or the recurrence paid line + "Ver
 * comprovante") and the consolidated Histórico. The Pix sheet
 * (responsavel-05) is addressed to the child.
 */
@Composable
fun PagamentosTab(
    modifier: Modifier = Modifier,
    viewModel: PagamentosViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Text(
            text = stringResource(R.string.pagamentos_title),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = stringResource(R.string.pagamentos_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        when (val payments = state.payments) {
            is PagamentosState.Loading -> CenteredLoading()
            is PagamentosState.Error -> EnrollmentErrorState(
                messageRes = payments.messageRes,
                onRetry = viewModel::refresh,
            )
            is PagamentosState.Loaded -> PagamentosContent(
                payments = payments.payments,
                creatingChargeId = state.creatingChargeId,
                actionErrorRes = state.actionErrorRes,
                onPayPix = viewModel::payWithPix,
                onOpenReceipt = viewModel::openReceipt,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    when (val sheet = state.sheet) {
        null -> Unit
        is PaymentSheet.Pix -> PixPaymentSheet(
            sheet = sheet,
            contextName = null, // dependentName addresses the sheet to the child
            onSimulate = viewModel::simulate,
            onDismiss = viewModel::dismissSheet,
        )
        is PaymentSheet.Success ->
            PaymentSuccessSheet(sheet = sheet, onDismiss = viewModel::dismissSheet)
        is PaymentSheet.Receipt -> ReceiptSheet(sheet = sheet, onDismiss = viewModel::dismissSheet)
        else -> Unit // boleto/cartão never mount on this surface (design truth)
    }
}

@Composable
private fun PagamentosContent(
    payments: GuardianPaymentsResponse,
    creatingChargeId: String?,
    actionErrorRes: Int?,
    onPayPix: (String) -> Unit,
    onOpenReceipt: (String) -> Unit,
) {
    actionErrorRes?.let {
        EnrollmentNotice(
            text = stringResource(it),
            containerColor = LumiraTokens.Colors.Danger100,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))
    }

    if (payments.dependents.isEmpty()) {
        EnrollmentNotice(text = stringResource(R.string.pagamentos_empty))
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
            payments.dependents.forEach { dependent ->
                DependentChargeCard(
                    dependent = dependent,
                    creating = creatingChargeId != null &&
                        creatingChargeId == dependent.currentCharge?.id,
                    busy = creatingChargeId != null,
                    onPayPix = { onPayPix(dependent.studentId) },
                    onOpenReceipt = onOpenReceipt,
                )
            }
        }
    }

    Spacer(Modifier.height(LumiraTokens.Space.S5))
    Text(
        text = stringResource(R.string.carteira_history_title),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    if (payments.history.isEmpty()) {
        Text(
            text = stringResource(R.string.carteira_history_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
            payments.history.forEach { entry ->
                GuardianHistoryRow(entry = entry, onOpenReceipt = onOpenReceipt)
            }
        }
    }
}

// ---- per-dependent card (responsavel-04) ----------------------------------

@Composable
private fun DependentChargeCard(
    dependent: DependentPayments,
    creating: Boolean,
    busy: Boolean,
    onPayPix: () -> Unit,
    onOpenReceipt: (String) -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S4)) {
            val charge = dependent.currentCharge
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = BillingFormat.dependentTitle(
                        fullName = dependent.fullName,
                        periodStart = charge?.periodStart,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                charge?.let { ChargeStatusChip(status = it.status, overdue = it.overdue) }
            }

            if (charge == null) {
                Spacer(Modifier.height(LumiraTokens.Space.S1))
                Text(
                    text = if (dependent.plan == null) {
                        stringResource(R.string.pagamentos_no_plan)
                    } else {
                        stringResource(R.string.pagamentos_no_charge)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                return@Column
            }

            Spacer(Modifier.height(LumiraTokens.Space.S2))
            Text(
                text = BillingFormat.amountBRL(charge.amountCents),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))

            val settled = if (charge.status == ChargeStatuses.PAID) {
                charge.payments.lastOrNull { it.status == PaymentStatuses.SUCCEEDED }
            } else {
                null
            }
            if (settled != null) {
                // "Pago em 02/08 via recorrência no cartão" + Ver comprovante (story 19).
                Text(
                    text = BillingFormat.paidLine(
                        paidAt = settled.paidAt,
                        method = settled.method,
                        viaRecurrence = dependent.recurrenceActive,
                    ),
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
            } else {
                // "Vence em 10 de agosto · plano Kids mensal"
                Text(
                    text = dependent.plan
                        ?.let {
                            "${BillingFormat.dueLabel(charge.dueDate)} · " +
                                BillingFormat.planSuffix(it)
                        }
                        ?: BillingFormat.dueLabel(charge.dueDate),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (charge.overdue) {
                        LumiraTokens.Colors.Danger500
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                Button(
                    onClick = onPayPix,
                    enabled = !busy,
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (creating) {
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
            }
        }
    }
}

// ---- consolidated histórico (story 20) ------------------------------------

@Composable
private fun GuardianHistoryRow(entry: GuardianHistoryEntry, onOpenReceipt: (String) -> Unit) {
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
                    text = BillingFormat.dependentTitle(
                        fullName = entry.studentName,
                        periodStart = entry.periodStart,
                    ),
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

@Composable
private fun CenteredLoading() {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}
