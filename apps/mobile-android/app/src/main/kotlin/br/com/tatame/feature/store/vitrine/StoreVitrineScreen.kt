package br.com.tatame.feature.store.vitrine

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import br.com.tatame.feature.enrollment.EnrollmentErrorState
import br.com.tatame.feature.store.StoreBackBubble
import br.com.tatame.feature.store.ProductGridCard
import br.com.tatame.feature.store.detail.StoreProductDetailScreen
import br.com.tatame.feature.store.pedidos.MeusPedidosScreen
import com.tatame.designsystem.tokens.LumiraTokens
import org.koin.androidx.compose.koinViewModel

/**
 * The shared storefront flow (STO.12/13) — ONE feature mounted in both the
 * aluno and professor shells (spec 009): vitrine per aluno-16/professor-13,
 * product detail per aluno-17, and Meus pedidos. The documented Meus pedidos
 * entry point is the "Meus pedidos ›" action on the vitrine header (spec:
 * "Meus pedidos — entry from the vitrine"). [initialProductId] lets the aluno
 * home strip open a product directly; its back lands on the vitrine.
 */
@Composable
fun StoreFlowScreen(
    academyName: String?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    initialProductId: String? = null,
) {
    var productOpen by rememberSaveable { mutableStateOf(initialProductId) }
    var pedidosOpen by rememberSaveable { mutableStateOf(false) }

    when {
        pedidosOpen -> MeusPedidosScreen(
            onBack = { pedidosOpen = false },
            modifier = modifier,
        )
        productOpen != null -> StoreProductDetailScreen(
            productId = productOpen!!,
            onBack = { productOpen = null },
            modifier = modifier,
        )
        else -> StoreVitrineScreen(
            academyName = academyName,
            onBack = onBack,
            onOpenProduct = { productOpen = it },
            onOpenPedidos = { pedidosOpen = true },
            modifier = modifier,
        )
    }
}

/**
 * Vitrine (STO.12, aluno-16/professor-13): header with the retirada subtitle,
 * busca over name+tags, a WORKING horizontally-scrollable category chip
 * carousel ("Tudo" + chips) and an unclipped 2-column grid — the prototype's
 * broken carousel and clipped grid are recorded bugs explicitly not
 * reproduced (spec stories 19–20).
 */
@Composable
fun StoreVitrineScreen(
    academyName: String?,
    onBack: () -> Unit,
    onOpenProduct: (String) -> Unit,
    onOpenPedidos: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: StoreVitrineViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = modifier.fillMaxSize()) {
        Spacer(Modifier.height(LumiraTokens.Space.S6))

        // ---- header (back · Loja <academia> · Meus pedidos entry) --------
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoreBackBubble(onBack = onBack)
            Spacer(Modifier.width(LumiraTokens.Space.S3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = academyName
                        ?.let { stringResource(R.string.store_title, it) }
                        ?: stringResource(R.string.store_title_fallback),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = stringResource(R.string.store_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = stringResource(R.string.store_meus_pedidos_entry),
                style = MaterialTheme.typography.labelSmall,
                color = LumiraTokens.Colors.Purple700,
                modifier = Modifier
                    .clickable(onClick = onOpenPedidos)
                    .padding(LumiraTokens.Space.S2),
            )
        }
        Spacer(Modifier.height(LumiraTokens.Space.S4))

        // ---- busca (server query over name + tags) -----------------------
        OutlinedTextField(
            value = state.search,
            onValueChange = viewModel::updateSearch,
            singleLine = true,
            placeholder = {
                Text(
                    text = stringResource(R.string.store_search_placeholder),
                    color = LumiraTokens.Colors.Fg4,
                    style = MaterialTheme.typography.bodySmall,
                )
            },
            shape = RoundedCornerShape(LumiraTokens.Radius.Md),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = LumiraTokens.Colors.Border1,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))

        // ---- the WORKING category chip carousel (spec story 19) ----------
        CategoryChipCarousel(
            categories = state.categories,
            selectedCategoryId = state.selectedCategoryId,
            onSelect = viewModel::selectCategory,
        )
        Spacer(Modifier.height(LumiraTokens.Space.S3))

        // ---- unclipped 2-column grid (spec story 20) ---------------------
        when (val vitrine = state.vitrine) {
            is VitrineState.Loading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = LumiraTokens.Space.S8),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }

            is VitrineState.Error -> EnrollmentErrorState(
                messageRes = vitrine.messageRes,
                onRetry = viewModel::refresh,
            )

            is VitrineState.Loaded -> if (vitrine.products.isEmpty()) {
                // Honest empty state — never fabricated products (story 21).
                Text(
                    text = stringResource(R.string.store_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = LumiraTokens.Space.S8),
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
                    verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3),
                    modifier = Modifier.weight(1f),
                ) {
                    items(vitrine.products, key = { it.id }) { product ->
                        ProductGridCard(
                            product = product,
                            onClick = { onOpenProduct(product.id) },
                        )
                    }
                    // Breathing room so the last row never sits clipped
                    // against the bottom bar.
                    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                        Spacer(Modifier.height(LumiraTokens.Space.S6))
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryChipCarousel(
    categories: List<br.com.tatame.core.network.dto.VitrineCategory>,
    selectedCategoryId: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S2)) {
        item(key = "tudo") {
            CategoryChip(
                label = stringResource(R.string.store_chip_all),
                selected = selectedCategoryId == null,
                onClick = { onSelect(null) },
            )
        }
        items(categories.size, key = { categories[it].id }) { index ->
            val category = categories[index]
            CategoryChip(
                label = category.name,
                selected = category.id == selectedCategoryId,
                onClick = { onSelect(category.id) },
            )
        }
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .background(
                color = if (selected) LumiraTokens.Colors.Purple700 else LumiraTokens.Colors.Gray100,
                shape = PillShape,
            )
            .clickable(onClick = onClick)
            .padding(horizontal = LumiraTokens.Space.S3, vertical = LumiraTokens.Space.S2),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) LumiraTokens.Colors.FgOnColor else LumiraTokens.Colors.Fg3,
        )
    }
}
