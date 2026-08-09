package br.com.tatame.feature.billing.responsavel

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ChargeStatuses
import br.com.tatame.core.network.dto.PaymentProviders
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.ReceiptSheetState
import br.com.tatame.testutil.FakeBillingRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.charge
import br.com.tatame.testutil.dependentPayments
import br.com.tatame.testutil.guardianPayments
import br.com.tatame.testutil.payment
import br.com.tatame.testutil.paymentCreated
import br.com.tatame.testutil.receiptResponse
import br.com.tatame.testutil.simulateResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** BIL.21 — responsável Pagamentos state machine over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class PagamentosViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `load maps per-dependent cards and consolidated historico`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(
            guardianPayments(
                dependents = listOf(
                    dependentPayments(),
                    dependentPayments(
                        studentId = "dst2",
                        fullName = "Júlia Silveira",
                        currentCharge = null,
                        recurrenceActive = true,
                    ),
                ),
            ),
        )
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value.payments
        assertTrue(state is PagamentosState.Loaded)
        val payments = (state as PagamentosState.Loaded).payments
        assertEquals(2, payments.dependents.size)
        assertEquals("Kids", payments.dependents[0].plan?.name)
        assertTrue(payments.dependents[1].recurrenceActive)
        assertEquals("Pedro Silveira", payments.history.single().studentName)
        assertEquals(1, repository.guardianPaymentsCalls)
    }

    @Test
    fun `failure surfaces mapped PT-BR copy and refresh refetches`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Failure(ApiError.Timeout)
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()

        assertEquals(
            PagamentosState.Error(R.string.error_timeout),
            viewModel.uiState.value.payments,
        )

        repository.guardianPaymentsResult = ApiResult.Success(guardianPayments())
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.payments is PagamentosState.Loaded)
        assertEquals(2, repository.guardianPaymentsCalls)
    }

    @Test
    fun `payWithPix opens the sheet addressed to the dependent`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(guardianPayments())
        repository.guardianPayPixResult = ApiResult.Success(
            paymentCreated(
                payment = payment(id = "dpay1", chargeId = "dch1", amountCents = 15_000),
                charge = charge(id = "dch1", studentId = "dst1", amountCents = 15_000),
            ),
        )
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()

        viewModel.payWithPix("dst1")
        advanceUntilIdle()

        assertEquals(listOf("dch1"), repository.guardianPayPixCalls)
        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Pix
        assertEquals("Pedro Silveira", sheet.dependentName)
        assertTrue(sheet.simulateAvailable)
    }

    @Test
    fun `payWithPix ignores dependents without an open charge`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(
            guardianPayments(
                dependents = listOf(dependentPayments(currentCharge = null)),
            ),
        )
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()

        viewModel.payWithPix("dst1")
        advanceUntilIdle()

        assertTrue(repository.guardianPayPixCalls.isEmpty())
        assertNull(viewModel.uiState.value.sheet)
    }

    @Test
    fun `pay failure lands inline on the panel`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(guardianPayments())
        repository.guardianPayPixResult =
            ApiResult.Failure(ApiError.Billing.ChargeNotPayable)
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()

        viewModel.payWithPix("dst1")
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.sheet)
        assertEquals(
            R.string.error_billing_charge_not_payable,
            viewModel.uiState.value.actionErrorRes,
        )
    }

    @Test
    fun `simulate settles shows the success pop and reloads`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(guardianPayments())
        repository.guardianPayPixResult = ApiResult.Success(
            paymentCreated(
                payment = payment(id = "dpay1", chargeId = "dch1"),
                charge = charge(id = "dch1", studentId = "dst1"),
            ),
        )
        repository.simulateResult = ApiResult.Success(
            simulateResponse(charge = charge(id = "dch1", status = ChargeStatuses.PAID)),
        )
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()
        viewModel.payWithPix("dst1")
        advanceUntilIdle()

        viewModel.simulate()
        advanceUntilIdle()

        assertEquals(listOf("dpay1"), repository.simulateCalls)
        assertTrue(viewModel.uiState.value.sheet is PaymentSheet.Success)
        assertEquals(2, repository.guardianPaymentsCalls)
    }

    @Test
    fun `simulate is gated off for a non-simulated provider`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(guardianPayments())
        repository.guardianPayPixResult = ApiResult.Success(
            paymentCreated(payment = payment(provider = PaymentProviders.STRIPE)),
        )
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()
        viewModel.payWithPix("dst1")
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Pix
        assertFalse(sheet.simulateAvailable)

        viewModel.simulate()
        advanceUntilIdle()

        assertTrue(repository.simulateCalls.isEmpty())
    }

    @Test
    fun `openReceipt loads the comprovante for a historico row`() = runTest {
        val repository = FakeBillingRepository()
        repository.guardianPaymentsResult = ApiResult.Success(guardianPayments())
        repository.receiptResult = ApiResult.Success(
            receiptResponse(studentName = "Pedro Silveira"),
        )
        val viewModel = PagamentosViewModel(repository)
        advanceUntilIdle()

        viewModel.openReceipt("dpay0")
        advanceUntilIdle()

        assertEquals(listOf("dpay0"), repository.receiptCalls)
        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Receipt
        val state = sheet.state as ReceiptSheetState.Loaded
        assertEquals("Pedro Silveira", state.receipt.studentName)
    }
}
