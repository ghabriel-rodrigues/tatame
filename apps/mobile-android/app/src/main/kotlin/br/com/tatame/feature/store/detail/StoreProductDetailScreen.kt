package br.com.tatame.feature.store.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import br.com.tatame.core.network.dto.ProductDetail
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.PixPaymentSheet
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.enrollment.EnrollmentNotice
import br.com.tatame.feature.events.BannerBackBubble
import br.com.tatame.feature.store.StoreFormat
import br.com.tatame.feature.store.storeGradientBrush
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

/**
 * Product detail (STO.12, aluno-17): full-bleed gradient banner with the
 * monogram, category chip and "Foto N de 3" pill; 3 thumbnail variants
 * switching the banner (deterministic catalog neighbors — spec: derivation,
 * not schema); name + price; description; #tag chips; size pills
 * (required-when-present); quantity stepper capped at stock; the stock +
 * retirada line ("Esgotado" disables the purchase); and "Comprar com Pix ·
 * R$ X" driving the EXISTING Pix sheet + gated simulate. A settled simulate
 * replaces the CTA with "Pedido pago — retire na recepção da academia."
 */
@Composable
fun StoreProductDetailScreen(
    productId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: StoreProductDetailViewModel = koinViewModel(key = "product-$productId") {
        parametersOf(productId)
    },
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))
        when (val detail = state.detail) {
            is ProductDetailState.Loading -> {
                BannerBackBubble(onBack = onBack)
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }

            is ProductDetailState.Error -> {
                BannerBackBubble(onBack = onBack)
                EnrollmentErrorState(messageRes = detail.messageRes, onRetry = viewModel::refresh)
            }

            is ProductDetailState.Loaded -> ProductDetailContent(
                product = detail.product,
                state = state,
                onBack = onBack,
                onSelectFoto = viewModel::selectFoto,
                onSelectSize = viewModel::selectSize,
                onIncrement = viewModel::incrementQuantity,
                onDecrement = viewModel::decrementQuantity,
                onBuy = viewModel::buy,
            )
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProductDetailContent(
    product: ProductDetail,
    state: StoreProductDetailUiState,
    onBack: () -> Unit,
    onSelectFoto: (Int) -> Unit,
    onSelectSize: (String) -> Unit,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onBuy: () -> Unit,
) {
    val gallery = StoreFormat.galleryPresets(product.gradientPreset)

    // ---- gradient banner (variant per gallery index, aluno-17) -----------
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .background(
                brush = storeGradientBrush(gallery[state.galleryIndex]),
                shape = RoundedCornerShape(LumiraTokens.Radius.Lg),
            )
            .padding(LumiraTokens.Space.S4),
    ) {
        BannerBackBubble(onBack = onBack, modifier = Modifier.align(Alignment.TopStart))
        product.categoryName?.let {
            BannerPill(text = it, modifier = Modifier.align(Alignment.TopEnd))
        }
        Text(
            text = product.monogram,
            style = MaterialTheme.typography.headlineMedium,
            color = LumiraTokens.Colors.FgOnColor,
            modifier = Modifier.align(Alignment.Center),
        )
        BannerPill(
            text = stringResource(R.string.store_foto_indicator, state.galleryIndex + 1),
            modifier = Modifier.align(Alignment.BottomEnd),
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S3))

    // ---- galeria thumbnails (3 deterministic variants) -------------------
    Row(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        gallery.forEachIndexed { index, preset ->
            val selected = index == state.galleryIndex
            Box(
                modifier = Modifier
                    .size(LumiraTokens.Space.S12)
                    .background(
                        brush = storeGradientBrush(preset),
                        shape = RoundedCornerShape(LumiraTokens.Radius.Sm),
                    )
                    .then(
                        if (selected) {
                            Modifier.border(
                                width = 2.dp,
                                color = LumiraTokens.Colors.Purple700,
                                shape = RoundedCornerShape(LumiraTokens.Radius.Sm),
                            )
                        } else {
                            Modifier
                        },
                    )
                    .clickable { onSelectFoto(index) },
            )
        }
    }
    Spacer(Modifier.height(LumiraTokens.Space.S4))

    // ---- name + price ----------------------------------------------------
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = product.name,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(LumiraTokens.Space.S2))
        Text(
            text = StoreFormat.priceBRL(product.priceCents),
            style = MaterialTheme.typography.titleMedium,
            color = LumiraTokens.Colors.Purple700,
        )
    }

    product.description?.let {
        Spacer(Modifier.height(LumiraTokens.Space.S2))
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (product.tags.isNotEmpty()) {
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
            verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        ) {
            product.tags.forEach { tag ->
                Box(
                    modifier = Modifier
                        .background(color = LumiraTokens.Colors.Gray100, shape = PillShape)
                        .padding(
                            horizontal = LumiraTokens.Space.S3,
                            vertical = LumiraTokens.Space.S1,
                        ),
                ) {
                    Text(
                        text = StoreFormat.tagChip(tag),
                        style = MaterialTheme.typography.labelSmall,
                        color = LumiraTokens.Colors.Fg3,
                    )
                }
            }
        }
    }

    // ---- tamanho (pills only when the product defines sizes, story 23) ---
    if (StoreFormat.sizeRequired(product.sizes)) {
        Spacer(Modifier.height(LumiraTokens.Space.S4))
        Text(
            text = stringResource(R.string.store_size_label),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S2))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
            verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2),
        ) {
            product.sizes.forEach { size ->
                val selected = size == state.selectedSize
                Box(
                    modifier = Modifier
                        .background(
                            color = if (selected) {
                                LumiraTokens.Colors.Purple700
                            } else {
                                MaterialTheme.colorScheme.surface
                            },
                            shape = PillShape,
                        )
                        .then(
                            if (selected) {
                                Modifier
                            } else {
                                Modifier.border(
                                    width = 1.dp,
                                    color = LumiraTokens.Colors.Border1,
                                    shape = PillShape,
                                )
                            },
                        )
                        .clickable { onSelectSize(size) }
                        .padding(
                            horizontal = LumiraTokens.Space.S4,
                            vertical = LumiraTokens.Space.S2,
                        ),
                ) {
                    Text(
                        text = size,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (selected) {
                            LumiraTokens.Colors.FgOnColor
                        } else {
                            LumiraTokens.Colors.Fg2
                        },
                    )
                }
            }
        }
    }

    // ---- quantidade (stepper capped at stock, story 24) ------------------
    Spacer(Modifier.height(LumiraTokens.Space.S4))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = stringResource(R.string.store_qty_label),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        StepperButton(glyph = "−", enabled = state.quantity > 1, onClick = onDecrement)
        Text(
            text = "${state.quantity}",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = LumiraTokens.Space.S3),
        )
        StepperButton(
            glyph = "+",
            enabled = state.quantity < product.stockQty,
            onClick = onIncrement,
            filled = true,
        )
    }
    Spacer(Modifier.height(LumiraTokens.Space.S2))

    // ---- stock + retirada line / esgotado --------------------------------
    if (product.stockQty > 0) {
        Text(
            text = StoreFormat.estoqueLine(product.stockQty),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    } else {
        Text(
            text = stringResource(R.string.store_esgotado_line),
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Danger500,
        )
    }

    state.actionErrorRes?.let {
        Spacer(Modifier.height(LumiraTokens.Space.S3))
        EnrollmentNotice(
            text = stringResource(it),
            containerColor = LumiraTokens.Colors.Danger100,
        )
    }

    Spacer(Modifier.height(LumiraTokens.Space.S5))

    // ---- CTA / paid banner (stories 25–26) -------------------------------
    if (state.paidOrderNumber != null) {
        PedidoPagoBanner()
    } else {
        val total = StoreFormat.totalCents(product.priceCents, state.quantity)
        Button(
            onClick = onBuy,
            enabled = !state.acting &&
                StoreFormat.canBuy(product.sizes, state.selectedSize, product.stockQty),
            shape = PillShape,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.acting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(LumiraTokens.Space.S4),
                    color = LumiraTokens.Colors.FgOnColor,
                )
            } else {
                Text(stringResource(R.string.store_buy_cta, StoreFormat.priceBRL(total)))
            }
        }
    }
}

/** Green "Pedido pago — retire na recepção da academia." banner (story 26). */
@Composable
private fun PedidoPagoBanner() {
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
                text = stringResource(R.string.store_paid_banner),
                style = MaterialTheme.typography.bodyMedium,
                color = LumiraTokens.Colors.Fg1,
            )
        }
    }
}

/** Semi-transparent white pill over the gradient banner (category / foto N). */
@Composable
private fun BannerPill(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(color = LumiraTokens.Colors.White.copy(alpha = 0.85f), shape = PillShape)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S1),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = LumiraTokens.Colors.Purple800,
        )
    }
}

@Composable
private fun StepperButton(
    glyph: String,
    enabled: Boolean,
    onClick: () -> Unit,
    filled: Boolean = false,
) {
    Box(
        modifier = Modifier
            .size(LumiraTokens.Space.S8)
            .background(
                color = when {
                    filled && enabled -> LumiraTokens.Colors.Purple700
                    filled -> LumiraTokens.Colors.Gray300
                    else -> LumiraTokens.Colors.Gray100
                },
                shape = PillShape,
            )
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = glyph,
            style = MaterialTheme.typography.titleMedium,
            color = if (filled) LumiraTokens.Colors.FgOnColor else LumiraTokens.Colors.Fg1,
        )
    }
}
