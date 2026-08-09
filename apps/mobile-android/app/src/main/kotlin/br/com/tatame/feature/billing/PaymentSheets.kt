package br.com.tatame.feature.billing

import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.feature.attendance.QrCodeCanvas
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * The three payment sheets + comprovante + success pop (BIL.20,
 * aluno-13/14/15) — shared with the responsável Pix flow (responsavel-05,
 * addressed to the dependent). "Simular pagamento"/"Simular compensação"
 * render only when the attempt's provider is simulated (spec 006, story 44).
 */

// ---- Pix (aluno-13 / responsavel-05) --------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PixPaymentSheet(
    sheet: PaymentSheet.Pix,
    contextName: String?, // academy (aluno) or dependent full name (responsável)
    onSimulate: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SheetHeader(
                title = stringResource(R.string.billing_pix_sheet_title),
                subtitle = BillingFormat.sheetSubtitle(
                    periodStart = sheet.charge.periodStart,
                    contextName = sheet.dependentName ?: contextName,
                ),
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            // The QR encodes the provider's render-ready payload, never a local guess.
            Surface(
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                color = LumiraTokens.Colors.White,
            ) {
                QrCodeCanvas(
                    content = sheet.payment.providerData?.qrPayload.orEmpty(),
                    modifier = Modifier
                        .size(180.dp)
                        .padding(LumiraTokens.Space.S3),
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Text(
                text = BillingFormat.amountBRL(sheet.payment.amountCents),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )

            sheet.errorRes?.let { SheetError(it) }

            Spacer(Modifier.height(LumiraTokens.Space.S4))
            CopyButton(
                label = stringResource(R.string.billing_copy_pix),
                value = sheet.payment.providerData?.copiaECola.orEmpty(),
                toastRes = R.string.billing_pix_copied,
            )
            if (sheet.simulateAvailable) {
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                SimulateButton(
                    label = stringResource(R.string.billing_simulate_payment),
                    simulating = sheet.simulating,
                    onClick = onSimulate,
                )
            }
        }
    }
}

// ---- Boleto (aluno-14) ----------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoletoPaymentSheet(
    sheet: PaymentSheet.Boleto,
    onSimulate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val linhaDigitavel = sheet.payment.providerData?.linhaDigitavel.orEmpty()
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
        ) {
            SheetHeader(
                title = stringResource(R.string.billing_boleto_sheet_title),
                subtitle = BillingFormat.sheetSubtitle(sheet.charge.periodStart, null) +
                    " · ${BillingFormat.dueLabel(sheet.charge.dueDate).lowercase()}" +
                    " · ${BillingFormat.amountBRL(sheet.payment.amountCents)}",
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            Surface(
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                color = LumiraTokens.Colors.White,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(LumiraTokens.Space.S3),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    BoletoBarcodeCanvas(
                        payload = sheet.payment.providerData?.barcodePayload
                            ?.takeIf { it.isNotBlank() } ?: linhaDigitavel,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                    )
                    Spacer(Modifier.height(LumiraTokens.Space.S2))
                    Text(
                        text = linhaDigitavel,
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Purple950,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            sheet.errorRes?.let { SheetError(it) }

            Spacer(Modifier.height(LumiraTokens.Space.S4))
            CopyButton(
                label = stringResource(R.string.billing_copy_linha),
                value = linhaDigitavel,
                toastRes = R.string.billing_linha_copied,
            )
            if (sheet.simulateAvailable) {
                Spacer(Modifier.height(LumiraTokens.Space.S2))
                SimulateButton(
                    label = stringResource(R.string.billing_simulate_boleto),
                    simulating = sheet.simulating,
                    onClick = onSimulate,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Text(
                text = stringResource(R.string.billing_boleto_footer),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

// ---- Cartão (aluno-15) ----------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardPaymentSheet(
    sheet: PaymentSheet.Card,
    onNumberChange: (String) -> Unit,
    onHolderChange: (String) -> Unit,
    onExpiryChange: (String) -> Unit,
    onCvvChange: (String) -> Unit,
    onToggleRecurrence: () -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
        ) {
            SheetHeader(
                title = stringResource(R.string.billing_card_sheet_title),
                subtitle = BillingFormat.sheetSubtitle(sheet.charge.periodStart, null) +
                    " · ${BillingFormat.amountBRL(sheet.charge.amountCents)}",
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))

            CardField(
                value = sheet.form.number,
                onValueChange = onNumberChange,
                placeholder = stringResource(R.string.billing_card_number_placeholder),
                keyboardType = KeyboardType.Number,
                enabled = !sheet.submitting,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            CardField(
                value = sheet.form.holderName,
                onValueChange = onHolderChange,
                placeholder = stringResource(R.string.billing_card_holder_placeholder),
                keyboardType = KeyboardType.Text,
                enabled = !sheet.submitting,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
            Row {
                CardField(
                    value = sheet.form.expiry,
                    onValueChange = onExpiryChange,
                    placeholder = stringResource(R.string.billing_card_expiry_placeholder),
                    keyboardType = KeyboardType.Number,
                    enabled = !sheet.submitting,
                    modifier = Modifier.weight(1.6f),
                )
                Spacer(Modifier.width(LumiraTokens.Space.S3))
                CardField(
                    value = sheet.form.cvv,
                    onValueChange = onCvvChange,
                    placeholder = stringResource(R.string.billing_card_cvv_placeholder),
                    keyboardType = KeyboardType.NumberPassword,
                    enabled = !sheet.submitting,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S3))

            // "Usar este cartão na recorrência mensal" — mandate opt-in, one gesture.
            Surface(
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
                color = LumiraTokens.Colors.BgSunken,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(
                        horizontal = LumiraTokens.Space.S3,
                        vertical = LumiraTokens.Space.S1,
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.billing_card_recurrence_toggle),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = sheet.form.recurrence,
                        onCheckedChange = { onToggleRecurrence() },
                        enabled = !sheet.submitting,
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = LumiraTokens.Colors.Purple500,
                        ),
                    )
                }
            }

            sheet.errorRes?.let { SheetError(it) }

            Spacer(Modifier.height(LumiraTokens.Space.S4))
            Button(
                onClick = onSubmit,
                enabled = sheet.form.complete && !sheet.submitting,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (sheet.submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(LumiraTokens.Space.S4),
                        color = LumiraTokens.Colors.FgOnColor,
                    )
                } else {
                    Text(
                        stringResource(
                            R.string.billing_card_pay_cta,
                            BillingFormat.amountBRL(sheet.charge.amountCents),
                        ),
                    )
                }
            }
        }
    }
}

// ---- success pop (story 15) -----------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentSuccessSheet(sheet: PaymentSheet.Success, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S12)
                    .background(color = LumiraTokens.Colors.Success500, shape = PillShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "✓",
                    style = MaterialTheme.typography.titleLarge,
                    color = LumiraTokens.Colors.FgOnColor,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S4))
            Text(
                text = stringResource(R.string.billing_success_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S1))
            Text(
                text = BillingFormat.monthName(sheet.periodStart)
                    ?.let { stringResource(R.string.billing_success_body, it) }
                    ?: stringResource(R.string.billing_success_body_no_month),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            if (sheet.mandateCreated) {
                Spacer(Modifier.height(LumiraTokens.Space.S1))
                Text(
                    text = stringResource(R.string.billing_success_mandate_line),
                    style = MaterialTheme.typography.bodySmall,
                    color = LumiraTokens.Colors.Purple700,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(LumiraTokens.Space.S5))
            Button(onClick = onDismiss, shape = PillShape, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.billing_close))
            }
        }
    }
}

// ---- comprovante ----------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReceiptSheet(sheet: PaymentSheet.Receipt, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = LumiraTokens.Space.S5)
                .padding(bottom = LumiraTokens.Space.S8),
        ) {
            Text(
                text = stringResource(R.string.billing_receipt_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S4))
            when (val state = sheet.state) {
                is ReceiptSheetState.Loading -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = LumiraTokens.Space.S6),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
                is ReceiptSheetState.Error -> Text(
                    text = stringResource(state.messageRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                is ReceiptSheetState.Loaded -> ReceiptBody(state)
            }
        }
    }
}

@Composable
private fun ReceiptBody(state: ReceiptSheetState.Loaded) {
    val receipt = state.receipt
    Column {
        ReceiptRow(
            label = stringResource(R.string.billing_receipt_amount),
            value = BillingFormat.amountBRL(receipt.payment.amountCents),
        )
        ReceiptRow(
            label = stringResource(R.string.billing_receipt_student),
            value = receipt.studentName,
        )
        receipt.planName?.let {
            ReceiptRow(label = stringResource(R.string.billing_receipt_plan), value = it)
        }
        receipt.academyName?.let {
            ReceiptRow(label = stringResource(R.string.billing_receipt_academy), value = it)
        }
        ReceiptRow(
            label = stringResource(R.string.billing_receipt_method),
            value = BillingFormat.methodLabel(receipt.payment.method),
        )
        BillingFormat.shortDate(receipt.payment.paidAt)?.let {
            ReceiptRow(label = stringResource(R.string.billing_receipt_paid_at), value = it)
        }
        ReceiptRow(
            label = stringResource(R.string.billing_receipt_payment_id),
            value = receipt.payment.id,
        )
    }
}

@Composable
private fun ReceiptRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = LumiraTokens.Space.S1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

// ---- shared bits ----------------------------------------------------------

@Composable
private fun SheetHeader(title: String, subtitle: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S1))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SheetError(messageRes: Int) {
    Spacer(Modifier.height(LumiraTokens.Space.S3))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = LumiraTokens.Colors.Danger100,
                shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            )
            .padding(LumiraTokens.Space.S3),
    ) {
        Text(
            text = stringResource(messageRes),
            style = MaterialTheme.typography.bodySmall,
            color = LumiraTokens.Colors.Fg1,
        )
    }
}

/** Copia-e-cola / linha digitável copy: system clipboard + confirmation toast. */
@Composable
private fun CopyButton(label: String, value: String, toastRes: Int) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    OutlinedButton(
        onClick = {
            clipboard.setText(AnnotatedString(value))
            Toast.makeText(context, toastRes, Toast.LENGTH_SHORT).show()
        },
        enabled = value.isNotBlank(),
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(text = "⧉ $label", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun SimulateButton(label: String, simulating: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !simulating,
        shape = PillShape,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (simulating) {
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
private fun CardField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        placeholder = { Text(text = placeholder, color = LumiraTokens.Colors.Fg4) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(LumiraTokens.Radius.Md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = LumiraTokens.Colors.Border1,
        ),
        modifier = modifier.fillMaxWidth(),
    )
}
