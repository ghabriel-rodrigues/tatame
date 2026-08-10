package br.com.tatame.feature.store.pedidos

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.OrderStatuses
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

/** Meus pedidos load state (STO.13). */
sealed interface PedidosState {
    data object Loading : PedidosState
    data class Error(@param:StringRes val messageRes: Int) : PedidosState
    data class Loaded(val orders: List<StoreOrder>) : PedidosState
}

data class MeusPedidosUiState(
    val pedidos: PedidosState = PedidosState.Loading,
    /** The existing Pix sheet resuming a pending order's SAME open charge. */
    val sheet: PaymentSheet? = null,
    /** The order whose sheet is open (settle flips exactly this row). */
    val payingOrderId: String? = null,
    /** Order id with a pay/cancel round trip in flight (row spinner/disable). */
    val actingOrderId: String? = null,
    @param:StringRes val actionErrorRes: Int? = null,
)

/**
 * Meus pedidos (STO.13, spec 009 stories 27–28): own orders newest first with
 * PT-BR status chips and the retirada note. An "Aguardando pagamento" order
 * offers Pagar — resuming its SAME open charge through the store payment
 * route + the existing Pix sheet/simulate — and Cancelar, which voids the
 * open charge server-side. A settled simulate flips the row to "Recebido"
 * in place; canceling a paid order is the admin refund's job, never shown.
 */
class MeusPedidosViewModel(
    private val storeRepository: StoreRepository,
    private val billingRepository: BillingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MeusPedidosUiState())
    val uiState: StateFlow<MeusPedidosUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(pedidos = PedidosState.Loading, actionErrorRes = null) }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    pedidos = when (val result = storeRepository.myOrders()) {
                        is ApiResult.Success -> PedidosState.Loaded(result.value.orders)
                        is ApiResult.Failure ->
                            PedidosState.Error(result.error.toStoreMessageRes())
                    },
                )
            }
        }
    }

    /** "Pagar" — pending only; resumes the order's open charge, no new order. */
    fun pay(orderId: String) {
        val order = findOrder(orderId) ?: return
        val chargeId = order.chargeId ?: return
        if (order.status != OrderStatuses.PENDING || _uiState.value.actingOrderId != null) return
        _uiState.update { it.copy(actingOrderId = orderId, actionErrorRes = null) }
        viewModelScope.launch {
            when (val payment = storeRepository.payPix(chargeId)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        actingOrderId = null,
                        payingOrderId = orderId,
                        sheet = PaymentSheet.Pix(
                            payment = payment.value.payment,
                            charge = payment.value.charge,
                            subtitle = StoreFormat.pixSubtitle(
                                order.number,
                                order.item?.productName ?: "",
                            ),
                        ),
                    )
                }
                is ApiResult.Failure -> fail(payment.error.toStoreMessageRes())
            }
        }
    }

    /** "Simular pagamento" — settle flips exactly the paying row to Recebido. */
    fun simulate() {
        val sheet = _uiState.value.sheet as? PaymentSheet.Pix ?: return
        if (sheet.simulating || !sheet.simulateAvailable) return
        _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = billingRepository.simulate(sheet.payment.id)) {
                is ApiResult.Success -> _uiState.update { state ->
                    state.copy(
                        sheet = null,
                        payingOrderId = null,
                        pedidos = mapOrder(state.pedidos, state.payingOrderId) {
                            it.copy(status = OrderStatuses.PAID, chargeId = null)
                        },
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

    /** "Cancelar pedido" — pending only (voids the open charge server-side). */
    fun cancel(orderId: String) {
        val order = findOrder(orderId) ?: return
        if (order.status != OrderStatuses.PENDING || _uiState.value.actingOrderId != null) return
        _uiState.update { it.copy(actingOrderId = orderId, actionErrorRes = null) }
        viewModelScope.launch {
            when (val result = storeRepository.cancelOrder(orderId)) {
                is ApiResult.Success -> _uiState.update { state ->
                    state.copy(
                        actingOrderId = null,
                        pedidos = mapOrder(state.pedidos, orderId) {
                            it.copy(status = OrderStatuses.CANCELED, chargeId = null)
                        },
                    )
                }
                is ApiResult.Failure -> fail(result.error.toStoreMessageRes())
            }
        }
    }

    fun dismissSheet() = _uiState.update { it.copy(sheet = null, payingOrderId = null) }

    // ---- helpers ---------------------------------------------------------

    private fun findOrder(orderId: String): StoreOrder? =
        (_uiState.value.pedidos as? PedidosState.Loaded)?.orders?.find { it.id == orderId }

    private fun mapOrder(
        pedidos: PedidosState,
        orderId: String?,
        transform: (StoreOrder) -> StoreOrder,
    ): PedidosState = when (pedidos) {
        is PedidosState.Loaded -> PedidosState.Loaded(
            pedidos.orders.map { if (it.id == orderId) transform(it) else it },
        )
        else -> pedidos
    }

    private fun fail(@StringRes messageRes: Int) = _uiState.update {
        it.copy(actingOrderId = null, actionErrorRes = messageRes)
    }
}
