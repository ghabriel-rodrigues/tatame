package br.com.tatame.feature.store.pedidos

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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.core.network.dto.OrderStatuses
import br.com.tatame.core.network.dto.StoreOrder
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.PixPaymentSheet
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.store.MonogramTile
import br.com.tatame.feature.store.OrderStatusChip
import br.com.tatame.feature.store.StoreBackBubble
import br.com.tatame.feature.store.StoreFormat
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * Meus pedidos (STO.13, spec 009 stories 27–28): own orders as cards —
 * monogram tile, "#2431 · produto", "Tam M · 1 un · R$ 389", PT-BR status
 * chip and the retirada note. "Aguardando pagamento" rows offer Pagar
 * (resuming the SAME open charge through the existing Pix sheet + simulate)
 * and Cancelar pedido. Reached from the vitrine header (documented entry).
 */
@Composable
fun MeusPedidosScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MeusPedidosViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoreBackBubble(onBack = onBack)
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Text(
                text = stringResource(R.string.store_pedidos_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        state.actionErrorRes?.let {
            EnrollmentNotice(
                text = stringResource(it),
                containerColor = LumiraTokens.Colors.Danger100,
            )
            Spacer(Modifier.height(LumiraTokens.Space.S3))
        }

        when (val pedidos = state.pedidos) {
            is PedidosState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }

            is PedidosState.Error -> EnrollmentErrorState(
                messageRes = pedidos.messageRes,
                onRetry = viewModel::refresh,
            )

            is PedidosState.Loaded -> if (pedidos.orders.isEmpty()) {
                Text(
                    text = stringResource(R.string.store_pedidos_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = LumiraTokens.Space.S8),
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3)) {
                    pedidos.orders.forEach { order ->
                        PedidoCard(
                            order = order,
                            acting = state.actingOrderId == order.id,
                            onPay = { viewModel.pay(order.id) },
                            onCancel = { viewModel.cancel(order.id) },
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(LumiraTokens.Space.S8))
    }

    (state.sheet as? PaymentSheet.Pix)?.let { sheet ->
        PixPaymentSheet(
            sheet = sheet,
            contextName = null, // the "Pedido #NNNN · <produto>" subtitle addresses it
            onSimulate = viewModel::simulate,
            onDismiss = viewModel::dismissSheet,
        )
    }
}

@Composable
private fun PedidoCard(
    order: StoreOrder,
    acting: Boolean,
    onPay: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(LumiraTokens.Space.S3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MonogramTile(
                    monogram = order.item?.monogram ?: "?",
                    gradientPreset = order.item?.gradientPreset,
                    modifier = Modifier.size(LumiraTokens.Space.S12),
                )
                Spacer(Modifier.width(LumiraTokens.Space.S3))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = StoreFormat.pedidoTitle(order.number, order.item?.productName),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    order.item?.let {
                        Text(
                            text = StoreFormat.itemLine(it.size, it.quantity, order.totalCents),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        text = order.pickupNote,
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Purple700,
                    )
                }
                Spacer(Modifier.width(LumiraTokens.Space.S2))
                OrderStatusChip(status = order.status)
            }

            // Pending: Pagar resumes the SAME charge; Cancelar voids it (story 28).
            if (order.status == OrderStatuses.PENDING) {
                Spacer(Modifier.height(LumiraTokens.Space.S3))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Button(
                        onClick = onPay,
                        enabled = !acting && order.chargeId != null,
                        shape = PillShape,
                        modifier = Modifier.weight(1f),
                    ) {
                        if (acting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(LumiraTokens.Space.S4),
                                color = LumiraTokens.Colors.FgOnColor,
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.store_pay_cta),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                    Spacer(Modifier.width(LumiraTokens.Space.S2))
                    TextButton(onClick = onCancel, enabled = !acting) {
                        Text(
                            text = stringResource(R.string.store_cancel_cta),
                            style = MaterialTheme.typography.labelSmall,
                            color = LumiraTokens.Colors.Danger500,
                        )
                    }
                }
            }
        }
    }
}
