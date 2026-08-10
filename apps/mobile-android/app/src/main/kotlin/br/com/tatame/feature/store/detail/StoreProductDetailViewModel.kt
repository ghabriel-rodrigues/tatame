package br.com.tatame.feature.store.detail

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ProductDetail
import br.com.tatame.core.network.dto.StoreOrder
import br.com.tatame.core.store.StoreRepository
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.toSimulateMessageRes
import br.com.tatame.feature.store.StoreFormat
import br.com.tatame.feature.store.toStoreMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Detail load state (STO.12, aluno-17). */
sealed interface ProductDetailState {
    data object Loading : ProductDetailState
    data class Error(@param:StringRes val messageRes: Int) : ProductDetailState
    data class Loaded(val product: ProductDetail) : ProductDetailState
}

data class StoreProductDetailUiState(
    val detail: ProductDetailState = ProductDetailState.Loading,
    /** null until the buyer picks a pill — required-when-present (story 23). */
    val selectedSize: String? = null,
    val quantity: Int = 1,
    /** 0-based "Foto N de 3" gallery variant index. */
    val galleryIndex: Int = 0,
    /** The existing Pix sheet, addressed "Pedido #NNNN · <produto>". */
    val sheet: PaymentSheet? = null,
    /** The created pending order backing the open sheet (retry + settle). */
    val activeOrder: StoreOrder? = null,
    /** An order/payment round trip is in flight (CTA spinner). */
    val acting: Boolean = false,
    @param:StringRes val actionErrorRes: Int? = null,
    /** Set on settle: "Pedido pago — retire na recepção da academia." */
    val paidOrderNumber: Int? = null,
)

/**
 * Product detail + purchase state machine (STO.12, aluno-17 + spec 009
 * stories 22–26): gallery variants derived from `gradientPreset` (spec —
 * derivation, not schema), size pills required-when-present, quantity stepper
 * capped at stock, and "Comprar com Pix · R$ X" creating the pending order +
 * order-origin charge, then riding the EXISTING billing rails — the store's
 * persona-neutral payment route mounts the same Pix sheet and the gated
 * simulate settles through the normalized-event handler. A settled simulate
 * flips the local state to the paid banner and decrements the shown stock
 * (mirroring the server-side decrement at `paid`).
 */
class StoreProductDetailViewModel(
    private val productId: String,
    private val storeRepository: StoreRepository,
    private val billingRepository: BillingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(StoreProductDetailUiState())
    val uiState: StateFlow<StoreProductDetailUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update {
            it.copy(detail = ProductDetailState.Loading, actionErrorRes = null)
        }
        viewModelScope.launch {
            _uiState.update {
                when (val result = storeRepository.productDetail(productId)) {
                    is ApiResult.Success -> it.copy(
                        detail = ProductDetailState.Loaded(result.value),
                        quantity = StoreFormat.clampQuantity(it.quantity, result.value.stockQty),
                    )
                    is ApiResult.Failure -> it.copy(
                        detail = ProductDetailState.Error(result.error.toStoreMessageRes()),
                    )
                }
            }
        }
    }

    // ---- selection (stories 22–24) ---------------------------------------

    /** Thumbnail tap — switches the banner variant ("Foto N de 3"). */
    fun selectFoto(index: Int) = _uiState.update {
        it.copy(galleryIndex = index.coerceIn(0, StoreFormat.GALLERY_SIZE - 1))
    }

    fun selectSize(size: String) {
        val product = loadedProduct() ?: return
        if (size !in product.sizes) return
        _uiState.update { it.copy(selectedSize = size, actionErrorRes = null) }
    }

    fun incrementQuantity() = stepQuantity(+1)

    fun decrementQuantity() = stepQuantity(-1)

    private fun stepQuantity(delta: Int) {
        val product = loadedProduct() ?: return
        _uiState.update {
            it.copy(quantity = StoreFormat.clampQuantity(it.quantity + delta, product.stockQty))
        }
    }

    // ---- purchase over the existing billing rails (story 25) -------------

    /**
     * "Comprar com Pix · R$ X": reuse the pending order's open charge when the
     * sheet round trip already created one, otherwise create the order (server
     * validates stock and size), then create the Pix attempt on the store's
     * persona-neutral payment route and mount the existing sheet.
     */
    fun buy() {
        val product = loadedProduct() ?: return
        val state = _uiState.value
        if (state.acting || state.paidOrderNumber != null) return
        if (!StoreFormat.canBuy(product.sizes, state.selectedSize, product.stockQty)) return
        act {
            val open = state.activeOrder?.takeIf { it.chargeId != null }
            val (order, chargeId) = if (open != null) {
                open to open.chargeId!!
            } else {
                when (
                    val result = storeRepository.createOrder(
                        productId = product.id,
                        size = state.selectedSize,
                        quantity = state.quantity,
                    )
                ) {
                    is ApiResult.Success -> result.value.order to result.value.chargeId
                    is ApiResult.Failure -> {
                        fail(result.error.toStoreMessageRes())
                        return@act
                    }
                }
            }
            when (val payment = storeRepository.payPix(chargeId)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        acting = false,
                        activeOrder = order,
                        sheet = PaymentSheet.Pix(
                            payment = payment.value.payment,
                            charge = payment.value.charge,
                            subtitle = StoreFormat.pixSubtitle(order.number, product.name),
                        ),
                    )
                }
                is ApiResult.Failure -> fail(payment.error.toStoreMessageRes())
            }
        }
    }

    /**
     * "Simular pagamento" — the handler settles the charge, flips the order to
     * paid and decrements stock server-side (story 26); the local mirror shows
     * the "Pedido pago" banner and the decremented stock.
     */
    fun simulate() {
        val sheet = _uiState.value.sheet as? PaymentSheet.Pix ?: return
        if (sheet.simulating || !sheet.simulateAvailable) return
        _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = billingRepository.simulate(sheet.payment.id)) {
                is ApiResult.Success -> _uiState.update { state ->
                    val product = loadedProduct(state)
                    state.copy(
                        sheet = null,
                        paidOrderNumber = state.activeOrder?.number,
                        activeOrder = null,
                        detail = product?.let {
                            ProductDetailState.Loaded(
                                it.copy(stockQty = it.stockQty - state.quantity),
                            )
                        } ?: state.detail,
                    )
                }
                is ApiResult.Failure -> _uiState.update { state ->
                    val current = state.sheet as? PaymentSheet.Pix ?: return@update state
                    state.copy(
                        sheet = current.copy(
                            simulating = false,
                            errorRes = result.error.toSimulateMessageRes(),
                        ),
                    )
                }
            }
        }
    }

    /** Dismissing keeps the pending order — Meus pedidos offers resume/cancel. */
    fun dismissSheet() = _uiState.update { it.copy(sheet = null) }

    // ---- helpers ---------------------------------------------------------

    private fun loadedProduct(
        state: StoreProductDetailUiState = _uiState.value,
    ): ProductDetail? = (state.detail as? ProductDetailState.Loaded)?.product

    private fun act(block: suspend () -> Unit) {
        _uiState.update { it.copy(acting = true, actionErrorRes = null) }
        viewModelScope.launch { block() }
    }

    private fun fail(@StringRes messageRes: Int) = _uiState.update {
        it.copy(acting = false, actionErrorRes = messageRes)
    }
}
