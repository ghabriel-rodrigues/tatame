package br.com.tatame.feature.store.pedidos

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.OrderStatuses
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.testutil.FakeBillingRepository
import br.com.tatame.testutil.FakeStoreRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.ordersResponse
import br.com.tatame.testutil.paymentCreated
import br.com.tatame.testutil.simulateResponse
import br.com.tatame.testutil.storeOrder
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * STO.13 — Meus pedidos (spec 009 stories 27–28): the own-orders list with
 * PT-BR status chips, "Pagar" resuming a pending order's SAME open charge
 * through the existing Pix sheet/simulate, and "Cancelar pedido" voiding a
 * pending order in place. Paid orders never offer buyer-side cancel.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MeusPedidosViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val store = FakeStoreRepository()
    private val billing = FakeBillingRepository()

    private fun viewModel() = MeusPedidosViewModel(store, billing)

    private fun orders(vm: MeusPedidosViewModel) =
        (vm.uiState.value.pedidos as PedidosState.Loaded).orders

    // ---- load ------------------------------------------------------------

    @Test
    fun `loads the own orders`() = runTest {
        store.myOrdersResult = ApiResult.Success(
            ordersResponse(
                storeOrder(),
                storeOrder(id = "or2", number = 2430, status = OrderStatuses.PAID, chargeId = null),
            ),
        )
        val vm = viewModel()
        advanceUntilIdle()

        assertEquals(1, store.myOrdersCalls)
        assertEquals(listOf("or1", "or2"), orders(vm).map { it.id })
    }

    @Test
    fun `load failure maps to PT-BR copy`() = runTest {
        store.myOrdersResult = ApiResult.Failure(ApiError.Network)
        val vm = viewModel()
        advanceUntilIdle()

        val error = vm.uiState.value.pedidos as PedidosState.Error
        assertEquals(R.string.error_network, error.messageRes)
    }

    // ---- Pagar resumes the same charge (story 27) ------------------------

    @Test
    fun `pagar resumes the pending order's same open charge`() = runTest {
        store.myOrdersResult = ApiResult.Success(ordersResponse(storeOrder()))
        store.payPixResult = ApiResult.Success(paymentCreated())
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay("or1")
        advanceUntilIdle()

        assertEquals(listOf("ch-or1"), store.payPixCalls) // resume, never a new order
        assertTrue(store.createOrderCalls.isEmpty())
        val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
        assertEquals("Pedido #2431 · Kimono oficial Horizonte", sheet.subtitle)
        assertEquals("or1", vm.uiState.value.payingOrderId)
    }

    @Test
    fun `pagar ignores non-pending rows`() = runTest {
        store.myOrdersResult = ApiResult.Success(
            ordersResponse(storeOrder(status = OrderStatuses.PAID)),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay("or1")
        advanceUntilIdle()

        assertTrue(store.payPixCalls.isEmpty())
        assertNull(vm.uiState.value.sheet)
    }

    @Test
    fun `pagar failure surfaces the billing copy`() = runTest {
        store.myOrdersResult = ApiResult.Success(ordersResponse(storeOrder()))
        store.payPixResult = ApiResult.Failure(ApiError.Billing.ChargeNotPayable)
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay("or1")
        advanceUntilIdle()

        assertEquals(
            R.string.error_billing_charge_not_payable,
            vm.uiState.value.actionErrorRes,
        )
        assertNull(vm.uiState.value.actingOrderId)
    }

    // ---- simulate flips exactly the paying row ---------------------------

    @Test
    fun `settled simulate flips exactly the paying row to Recebido`() = runTest {
        store.myOrdersResult = ApiResult.Success(
            ordersResponse(storeOrder(), storeOrder(id = "or2", number = 2432, chargeId = "ch-or2")),
        )
        store.payPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Success(simulateResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay("or1")
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        assertEquals(listOf("pay1"), billing.simulateCalls)
        assertNull(vm.uiState.value.sheet)
        assertNull(vm.uiState.value.payingOrderId)
        val paid = orders(vm).first { it.id == "or1" }
        assertEquals(OrderStatuses.PAID, paid.status)
        assertNull(paid.chargeId)
        // The sibling pending row is untouched.
        assertEquals(OrderStatuses.PENDING, orders(vm).first { it.id == "or2" }.status)
    }

    @Test
    fun `simulate failure keeps the sheet open with the copy`() = runTest {
        store.myOrdersResult = ApiResult.Success(ordersResponse(storeOrder()))
        store.payPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Failure(ApiError.NotFound)
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay("or1")
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
        assertFalse(sheet.simulating)
        assertEquals(R.string.error_billing_simulate_unavailable, sheet.errorRes)
        assertEquals(
            OrderStatuses.PENDING,
            orders(vm).single().status, // the row never flips on failure
        )
    }

    // ---- Cancelar pedido (story 28) --------------------------------------

    @Test
    fun `cancel voids the pending order in place`() = runTest {
        store.myOrdersResult = ApiResult.Success(ordersResponse(storeOrder()))
        val vm = viewModel()
        advanceUntilIdle()

        vm.cancel("or1")
        advanceUntilIdle()

        assertEquals(listOf("or1"), store.cancelOrderCalls)
        val canceled = orders(vm).single()
        assertEquals(OrderStatuses.CANCELED, canceled.status)
        assertNull(canceled.chargeId)
    }

    @Test
    fun `cancel ignores paid rows — refund is the admin's job`() = runTest {
        store.myOrdersResult = ApiResult.Success(
            ordersResponse(storeOrder(status = OrderStatuses.PAID)),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.cancel("or1")
        advanceUntilIdle()

        assertTrue(store.cancelOrderCalls.isEmpty())
        assertEquals(OrderStatuses.PAID, orders(vm).single().status)
    }

    @Test
    fun `cancel failure surfaces the order_not_cancelable copy`() = runTest {
        store.myOrdersResult = ApiResult.Success(ordersResponse(storeOrder()))
        store.cancelOrderResult = ApiResult.Failure(ApiError.Store.OrderNotCancelable)
        val vm = viewModel()
        advanceUntilIdle()

        vm.cancel("or1")
        advanceUntilIdle()

        assertEquals(
            R.string.error_store_order_not_cancelable,
            vm.uiState.value.actionErrorRes,
        )
        assertEquals(OrderStatuses.PENDING, orders(vm).single().status)
    }

    // ---- dismiss ---------------------------------------------------------

    @Test
    fun `dismissing the sheet keeps the pending row for a later Pagar`() = runTest {
        store.myOrdersResult = ApiResult.Success(ordersResponse(storeOrder()))
        store.payPixResult = ApiResult.Success(paymentCreated())
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay("or1")
        advanceUntilIdle()
        vm.dismissSheet()

        assertNull(vm.uiState.value.sheet)
        assertNull(vm.uiState.value.payingOrderId)
        assertEquals(OrderStatuses.PENDING, orders(vm).single().status)
    }
}
