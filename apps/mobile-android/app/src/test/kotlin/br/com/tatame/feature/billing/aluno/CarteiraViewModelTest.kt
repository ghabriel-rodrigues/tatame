package br.com.tatame.feature.billing.aluno

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.ChargeStatuses
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.PaymentProviders
import br.com.tatame.core.network.dto.PaymentStatuses
import br.com.tatame.core.network.dto.WalletRecurrence
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.ReceiptSheetState
import br.com.tatame.testutil.FakeBillingRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.charge
import br.com.tatame.testutil.chargeWithPayments
import br.com.tatame.testutil.historyEntry
import br.com.tatame.testutil.payment
import br.com.tatame.testutil.paymentCreated
import br.com.tatame.testutil.receiptResponse
import br.com.tatame.testutil.simulateResponse
import br.com.tatame.testutil.walletResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** BIL.19/20 — aluno Carteira state machine over the fake repository (JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class CarteiraViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun loadedViewModel(
        repository: FakeBillingRepository = FakeBillingRepository(),
    ): Pair<CarteiraViewModel, FakeBillingRepository> {
        if (repository.walletResult is ApiResult.Failure) {
            repository.walletResult = ApiResult.Success(walletResponse())
        }
        return CarteiraViewModel(repository) to repository
    }

    // ---- wallet states (BIL.19) ------------------------------------------

    @Test
    fun `load maps plan charge recurrence and historico`() = runTest {
        val repository = FakeBillingRepository()
        repository.walletResult = ApiResult.Success(
            walletResponse(
                recurrence = WalletRecurrence(active = true, nextChargeDueDate = "2026-09-01"),
                history = listOf(historyEntry()),
            ),
        )
        val viewModel = CarteiraViewModel(repository)
        advanceUntilIdle()

        val state = viewModel.uiState.value.wallet
        assertTrue(state is WalletState.Loaded)
        val wallet = (state as WalletState.Loaded).wallet
        assertEquals("Mensal", wallet.plan?.name)
        assertEquals(ChargeStatuses.OPEN, wallet.currentCharge?.status)
        assertTrue(wallet.recurrence.active)
        assertEquals(1, wallet.history.size)
        assertEquals(1, repository.walletCalls)
    }

    @Test
    fun `empty state carries a null plan without inventing charges`() = runTest {
        val repository = FakeBillingRepository()
        repository.walletResult =
            ApiResult.Success(walletResponse(plan = null, currentCharge = null))
        val viewModel = CarteiraViewModel(repository)
        advanceUntilIdle()

        val wallet = (viewModel.uiState.value.wallet as WalletState.Loaded).wallet
        assertNull(wallet.plan)
        assertNull(wallet.currentCharge)
    }

    @Test
    fun `failure surfaces mapped PT-BR copy and refresh refetches`() = runTest {
        val repository = FakeBillingRepository()
        repository.walletResult = ApiResult.Failure(ApiError.Network)
        val viewModel = CarteiraViewModel(repository)
        advanceUntilIdle()

        assertEquals(
            WalletState.Error(R.string.error_network),
            viewModel.uiState.value.wallet,
        )

        repository.walletResult = ApiResult.Success(walletResponse())
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.wallet is WalletState.Loaded)
        assertEquals(2, repository.walletCalls)
    }

    // ---- Pix flow (BIL.20, aluno-13) -------------------------------------

    @Test
    fun `payWithPix opens the sheet with the provider payload`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payPixResult = ApiResult.Success(paymentCreated())

        viewModel.payWithPix()
        advanceUntilIdle()

        assertEquals(listOf("ch1"), repository.payPixCalls)
        val sheet = viewModel.uiState.value.sheet
        assertTrue(sheet is PaymentSheet.Pix)
        sheet as PaymentSheet.Pix
        assertEquals("TATAME-SIM-PIX-ch1", sheet.payment.providerData?.copiaECola)
        assertTrue(sheet.simulateAvailable)
    }

    @Test
    fun `simulate settles shows the success pop and reloads the wallet`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payPixResult = ApiResult.Success(paymentCreated())
        repository.simulateResult = ApiResult.Success(simulateResponse())
        viewModel.payWithPix()
        advanceUntilIdle()

        repository.walletResult = ApiResult.Success(
            walletResponse(
                currentCharge = chargeWithPayments(
                    status = ChargeStatuses.PAID,
                    payments = listOf(
                        payment(
                            status = PaymentStatuses.SUCCEEDED,
                            paidAt = "2026-08-02T12:00:00.000Z",
                        ),
                    ),
                ),
            ),
        )
        viewModel.simulate()
        advanceUntilIdle()

        assertEquals(listOf("pay1"), repository.simulateCalls)
        val sheet = viewModel.uiState.value.sheet
        assertTrue(sheet is PaymentSheet.Success)
        assertEquals("2026-08-01", (sheet as PaymentSheet.Success).periodStart)
        // The card flipped to Paga from the silent reload (story 15).
        val wallet = (viewModel.uiState.value.wallet as WalletState.Loaded).wallet
        assertEquals(ChargeStatuses.PAID, wallet.currentCharge?.status)
        assertEquals(2, repository.walletCalls)
    }

    @Test
    fun `simulate is gated off for a non-simulated provider`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payPixResult = ApiResult.Success(
            paymentCreated(payment = payment(provider = PaymentProviders.STRIPE)),
        )
        viewModel.payWithPix()
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Pix
        assertFalse(sheet.simulateAvailable)

        viewModel.simulate()
        advanceUntilIdle()

        assertTrue(repository.simulateCalls.isEmpty())
    }

    @Test
    fun `simulate failure surfaces copy on the sheet and a 404 reads unavailable`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payPixResult = ApiResult.Success(paymentCreated())
        repository.simulateResult = ApiResult.Failure(ApiError.NotFound)
        viewModel.payWithPix()
        advanceUntilIdle()

        viewModel.simulate()
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Pix
        assertFalse(sheet.simulating)
        assertEquals(R.string.error_billing_simulate_unavailable, sheet.errorRes)
    }

    @Test
    fun `pay failure lands inline on the mensalidade card`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payPixResult = ApiResult.Failure(ApiError.Billing.ChargeNotPayable)

        viewModel.payWithPix()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.sheet)
        assertNull(viewModel.uiState.value.creatingMethod)
        assertEquals(
            R.string.error_billing_charge_not_payable,
            viewModel.uiState.value.actionErrorRes,
        )
    }

    // ---- boleto flow (aluno-14) ------------------------------------------

    @Test
    fun `payWithBoleto opens the boleto sheet with simulate gating`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payBoletoResult = ApiResult.Success(
            paymentCreated(
                payment = payment(
                    method = PaymentMethods.BOLETO,
                    providerData = br.com.tatame.core.network.dto.PaymentProviderData(
                        linhaDigitavel = "34191.79001 01043.510047 91020.150008 6 94330000018000",
                        barcodePayload = "34196943300000180001790101043510049102015000",
                    ),
                ),
            ),
        )

        viewModel.payWithBoleto()
        advanceUntilIdle()

        assertEquals(listOf("ch1"), repository.payBoletoCalls)
        val sheet = viewModel.uiState.value.sheet
        assertTrue(sheet is PaymentSheet.Boleto)
        sheet as PaymentSheet.Boleto
        assertTrue(sheet.simulateAvailable)
        assertTrue(sheet.payment.providerData?.linhaDigitavel!!.startsWith("34191"))
    }

    // ---- cartão flow (aluno-15) ------------------------------------------

    @Test
    fun `card sheet opens with the recurrence toggle defaulted on`() = runTest {
        val (viewModel, _) = loadedViewModel()
        advanceUntilIdle()

        viewModel.openCardSheet()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Card
        assertTrue(sheet.form.recurrence)
        assertFalse(sheet.form.complete)
    }

    @Test
    fun `card sheet toggle defaults off when a mandate is already active`() = runTest {
        val repository = FakeBillingRepository()
        repository.walletResult = ApiResult.Success(
            walletResponse(recurrence = WalletRecurrence(active = true)),
        )
        val viewModel = CarteiraViewModel(repository)
        advanceUntilIdle()

        viewModel.openCardSheet()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Card
        assertFalse(sheet.form.recurrence)
    }

    @Test
    fun `submitCard sends display metadata settles inline and reports the mandate`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payCardResult = ApiResult.Success(
            paymentCreated(
                payment = payment(
                    method = PaymentMethods.CARD,
                    status = PaymentStatuses.SUCCEEDED,
                ),
                charge = charge(status = ChargeStatuses.PAID),
                mandateCreated = true,
            ),
        )
        viewModel.openCardSheet()
        viewModel.updateCardNumber("4242 4242 4242 4242")
        viewModel.updateCardHolder("Lucas Almeida")
        viewModel.updateCardExpiry("1230")
        viewModel.updateCardCvv("123")

        viewModel.submitCard()
        advanceUntilIdle()

        val (chargeId, recurrence, card) = repository.payCardCalls.single()
        assertEquals("ch1", chargeId)
        assertTrue(recurrence)
        assertEquals("4242", card?.last4)
        assertEquals("Lucas Almeida", card?.holderName)
        val sheet = viewModel.uiState.value.sheet
        assertTrue(sheet is PaymentSheet.Success)
        assertTrue((sheet as PaymentSheet.Success).mandateCreated)
        assertEquals(2, repository.walletCalls)
    }

    @Test
    fun `submitCard requires a complete form`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        viewModel.openCardSheet()
        viewModel.updateCardNumber("4242")

        viewModel.submitCard()
        advanceUntilIdle()

        assertTrue(repository.payCardCalls.isEmpty())
    }

    @Test
    fun `card expiry input auto-formats MM-AA`() = runTest {
        val (viewModel, _) = loadedViewModel()
        advanceUntilIdle()
        viewModel.openCardSheet()

        viewModel.updateCardExpiry("12")
        assertEquals(
            "12",
            (viewModel.uiState.value.sheet as PaymentSheet.Card).form.expiry,
        )
        viewModel.updateCardExpiry("1230")
        assertEquals(
            "12/30",
            (viewModel.uiState.value.sheet as PaymentSheet.Card).form.expiry,
        )
    }

    @Test
    fun `card failure surfaces the mandate mismatch copy on the sheet`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.payCardResult = ApiResult.Failure(ApiError.Billing.MandateAlreadyActive)
        viewModel.openCardSheet()
        viewModel.updateCardNumber("4242424242424242")
        viewModel.updateCardHolder("Lucas Almeida")
        viewModel.updateCardExpiry("1230")
        viewModel.updateCardCvv("123")

        viewModel.submitCard()
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Card
        assertFalse(sheet.submitting)
        assertEquals(R.string.error_billing_mandate_already_active, sheet.errorRes)
    }

    // ---- recurrence cancel (story 14) ------------------------------------

    @Test
    fun `cancelRecurrence deletes the mandate and reloads`() = runTest {
        val repository = FakeBillingRepository()
        repository.walletResult = ApiResult.Success(
            walletResponse(recurrence = WalletRecurrence(active = true)),
        )
        val viewModel = CarteiraViewModel(repository)
        advanceUntilIdle()

        repository.walletResult = ApiResult.Success(walletResponse())
        viewModel.cancelRecurrence()
        advanceUntilIdle()

        assertEquals(1, repository.cancelMandateCalls)
        assertEquals(2, repository.walletCalls)
        val wallet = (viewModel.uiState.value.wallet as WalletState.Loaded).wallet
        assertFalse(wallet.recurrence.active)
        assertNull(viewModel.uiState.value.actionErrorRes)
    }

    @Test
    fun `cancelRecurrence treats a stale 404 as resolved`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.cancelMandateResult = ApiResult.Failure(ApiError.NotFound)

        viewModel.cancelRecurrence()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.actionErrorRes)
        assertEquals(2, repository.walletCalls)
    }

    // ---- comprovante (BIL.20) --------------------------------------------

    @Test
    fun `openReceipt loads the comprovante sheet`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.receiptResult = ApiResult.Success(receiptResponse())

        viewModel.openReceipt("pay0")
        advanceUntilIdle()

        assertEquals(listOf("pay0"), repository.receiptCalls)
        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Receipt
        val state = sheet.state as ReceiptSheetState.Loaded
        assertEquals("Lucas Almeida", state.receipt.studentName)
        assertEquals("Horizonte BJJ", state.receipt.academyName)
    }

    @Test
    fun `receipt failure surfaces copy inside the sheet`() = runTest {
        val (viewModel, repository) = loadedViewModel()
        advanceUntilIdle()
        repository.receiptResult = ApiResult.Failure(ApiError.NotFound)

        viewModel.openReceipt("pay0")
        advanceUntilIdle()

        val sheet = viewModel.uiState.value.sheet as PaymentSheet.Receipt
        assertEquals(ReceiptSheetState.Error(R.string.error_not_found), sheet.state)
    }
}
