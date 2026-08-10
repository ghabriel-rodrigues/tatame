package br.com.tatame.feature.store.detail

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.testutil.FakeBillingRepository
import br.com.tatame.testutil.FakeStoreRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.createOrderResponse
import br.com.tatame.testutil.paymentCreated
import br.com.tatame.testutil.productDetail
import br.com.tatame.testutil.simulateResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * STO.12 — the aluno-17 detail + purchase state machine (spec 009 stories
 * 22–26): gallery variant switching, size pills required-when-present, the
 * stock-capped stepper, "Comprar com Pix" creating the pending order + charge
 * over the EXISTING billing rails, and the gated simulate flipping to the
 * "Pedido pago" banner with the local stock mirror.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoreProductDetailViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val store = FakeStoreRepository()
    private val billing = FakeBillingRepository()

    private fun viewModel(productId: String = "pr1") =
        StoreProductDetailViewModel(productId, store, billing)

    private fun loadedProduct(vm: StoreProductDetailViewModel) =
        (vm.uiState.value.detail as ProductDetailState.Loaded).product

    // ---- load ------------------------------------------------------------

    @Test
    fun `loads the detail for the routed product id`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(id = "pr9"))
        val vm = viewModel(productId = "pr9")
        advanceUntilIdle()

        assertEquals(listOf("pr9"), store.detailCalls)
        assertEquals("Kimono oficial Horizonte", loadedProduct(vm).name)
        assertEquals(1, vm.uiState.value.quantity)
    }

    @Test
    fun `load failure maps to PT-BR copy`() = runTest {
        store.detailResult = ApiResult.Failure(ApiError.NotFound)
        val vm = viewModel()
        advanceUntilIdle()

        val error = vm.uiState.value.detail as ProductDetailState.Error
        assertEquals(R.string.error_not_found, error.messageRes)
    }

    // ---- gallery (story 22: "Foto N de 3" derivation) --------------------

    @Test
    fun `thumbnail tap switches the variant clamped to the gallery`() = runTest {
        store.detailResult = ApiResult.Success(productDetail())
        val vm = viewModel()
        advanceUntilIdle()

        vm.selectFoto(2)
        assertEquals(2, vm.uiState.value.galleryIndex)
        vm.selectFoto(9)
        assertEquals(2, vm.uiState.value.galleryIndex)
        vm.selectFoto(-1)
        assertEquals(0, vm.uiState.value.galleryIndex)
    }

    // ---- size pills + stepper (stories 23–24) ----------------------------

    @Test
    fun `size pill selects only the product's own sizes`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = listOf("P", "M")))
        val vm = viewModel()
        advanceUntilIdle()

        vm.selectSize("XXG")
        assertNull(vm.uiState.value.selectedSize)
        vm.selectSize("M")
        assertEquals("M", vm.uiState.value.selectedSize)
    }

    @Test
    fun `stepper caps at stock and floors at 1`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(stockQty = 2))
        val vm = viewModel()
        advanceUntilIdle()

        repeat(5) { vm.incrementQuantity() }
        assertEquals(2, vm.uiState.value.quantity)
        repeat(5) { vm.decrementQuantity() }
        assertEquals(1, vm.uiState.value.quantity)
    }

    // ---- purchase over the existing billing rails (story 25) -------------

    @Test
    fun `buy without the required size never leaves the screen`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = listOf("P", "M")))
        val vm = viewModel()
        advanceUntilIdle()

        vm.buy()
        advanceUntilIdle()

        assertTrue(store.createOrderCalls.isEmpty())
    }

    @Test
    fun `buy creates the order and mounts the addressed Pix sheet`() = runTest {
        store.detailResult = ApiResult.Success(productDetail())
        store.createOrderResult = ApiResult.Success(createOrderResponse())
        store.payPixResult = ApiResult.Success(paymentCreated())
        val vm = viewModel()
        advanceUntilIdle()

        vm.selectSize("M")
        vm.incrementQuantity()
        vm.buy()
        advanceUntilIdle()

        assertEquals(listOf(Triple("pr1", "M", 2)), store.createOrderCalls)
        assertEquals(listOf("ch-or1"), store.payPixCalls)
        val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
        assertEquals("Pedido #2431 · Kimono oficial Horizonte", sheet.subtitle)
        assertEquals(2431, vm.uiState.value.activeOrder?.number)
        assertFalse(vm.uiState.value.acting)
    }

    @Test
    fun `insufficient stock at order creation surfaces the PT-BR copy`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = emptyList()))
        store.createOrderResult = ApiResult.Failure(ApiError.Store.InsufficientStock)
        val vm = viewModel()
        advanceUntilIdle()

        vm.buy()
        advanceUntilIdle()

        assertEquals(
            R.string.error_store_insufficient_stock,
            vm.uiState.value.actionErrorRes,
        )
        assertNull(vm.uiState.value.sheet)
        assertFalse(vm.uiState.value.acting)
    }

    @Test
    fun `payment failure after the order surfaces the error`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = emptyList()))
        store.createOrderResult = ApiResult.Success(createOrderResponse())
        store.payPixResult = ApiResult.Failure(ApiError.Network)
        val vm = viewModel()
        advanceUntilIdle()

        vm.buy()
        advanceUntilIdle()

        assertEquals(R.string.error_network, vm.uiState.value.actionErrorRes)
        assertNull(vm.uiState.value.sheet)
    }

    @Test
    fun `reopening after dismiss reuses the pending order's same charge`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = emptyList()))
        store.createOrderResult = ApiResult.Success(createOrderResponse())
        store.payPixResult = ApiResult.Success(paymentCreated())
        val vm = viewModel()
        advanceUntilIdle()

        vm.buy()
        advanceUntilIdle()
        vm.dismissSheet()
        assertNotNull(vm.uiState.value.activeOrder) // pending order survives dismiss
        vm.buy()
        advanceUntilIdle()

        assertEquals(1, store.createOrderCalls.size) // no duplicate order
        assertEquals(listOf("ch-or1", "ch-or1"), store.payPixCalls)
        assertNotNull(vm.uiState.value.sheet)
    }

    // ---- simulate settles (story 26) -------------------------------------

    @Test
    fun `settled simulate shows the paid banner and mirrors the stock decrement`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = emptyList(), stockQty = 12))
        store.createOrderResult = ApiResult.Success(createOrderResponse())
        store.payPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Success(simulateResponse())
        val vm = viewModel()
        advanceUntilIdle()

        vm.incrementQuantity() // qty 2
        vm.buy()
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        assertEquals(listOf("pay1"), billing.simulateCalls)
        assertNull(vm.uiState.value.sheet)
        assertEquals(2431, vm.uiState.value.paidOrderNumber)
        assertNull(vm.uiState.value.activeOrder)
        assertEquals(10, loadedProduct(vm).stockQty)
    }

    @Test
    fun `simulate failure keeps the sheet open with the copy`() = runTest {
        store.detailResult = ApiResult.Success(productDetail(sizes = emptyList()))
        store.createOrderResult = ApiResult.Success(createOrderResponse())
        store.payPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Failure(ApiError.NotFound)
        val vm = viewModel()
        advanceUntilIdle()

        vm.buy()
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
        assertFalse(sheet.simulating)
        assertEquals(R.string.error_billing_simulate_unavailable, sheet.errorRes)
        assertNull(vm.uiState.value.paidOrderNumber)
    }
}
