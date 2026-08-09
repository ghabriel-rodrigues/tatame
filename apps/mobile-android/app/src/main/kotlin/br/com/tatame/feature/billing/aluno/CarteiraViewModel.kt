package br.com.tatame.feature.billing.aluno

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.CardDetails
import br.com.tatame.core.network.dto.Charge
import br.com.tatame.core.network.dto.ChargeWithPayments
import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.PaymentStatuses
import br.com.tatame.core.network.dto.WalletResponse
import br.com.tatame.feature.billing.CardFormState
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.ReceiptSheetState
import br.com.tatame.feature.billing.toBillingMessageRes
import br.com.tatame.feature.billing.toSimulateMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Carteira load state (BIL.19, aluno-12). */
sealed interface WalletState {
    data object Loading : WalletState
    data class Error(@param:StringRes val messageRes: Int) : WalletState
    data class Loaded(val wallet: WalletResponse) : WalletState
}

data class CarteiraUiState(
    val wallet: WalletState = WalletState.Loading,
    val sheet: PaymentSheet? = null,
    /** Method whose create-payment POST is in flight (spinner on that button). */
    val creatingMethod: String? = null,
    /** Create/cancel failures surfaced inline on the mensalidade card. */
    @param:StringRes val actionErrorRes: Int? = null,
    val cancelingMandate: Boolean = false,
)

/**
 * Aluno Carteira state machine (BIL.19/20): wallet fetch (the server
 * materializes the current cycle on read), the three payment sheets converging
 * on POST /aluno/wallet/charges/:id/payments, simulate settlement for
 * Pix/boleto (gated on the simulated provider), inline card settle with the
 * recurrence toggle, mandate cancel, and the comprovante sheet.
 */
class CarteiraViewModel(private val repository: BillingRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(CarteiraUiState())
    val uiState: StateFlow<CarteiraUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(wallet = WalletState.Loading, actionErrorRes = null) }
        viewModelScope.launch { load() }
    }

    /** Post-settle reload keeps the Loaded card on screen until fresh data lands. */
    private suspend fun load() {
        val state = when (val result = repository.wallet()) {
            is ApiResult.Success -> WalletState.Loaded(result.value)
            is ApiResult.Failure -> WalletState.Error(result.error.toBillingMessageRes())
        }
        _uiState.update { it.copy(wallet = state) }
    }

    // ---- payment creation (aluno-13/14/15) -------------------------------

    fun payWithPix() = createPayment(METHOD_PIX)

    fun payWithBoleto() = createPayment(METHOD_BOLETO)

    /** Cartão opens as a local form; the POST happens on [submitCard]. */
    fun openCardSheet() {
        val charge = currentChargeOrNull() ?: return
        _uiState.update {
            it.copy(
                sheet = PaymentSheet.Card(
                    charge = charge.toCharge(),
                    // Handoff default: toggle on — unless a mandate is already active.
                    form = CardFormState(recurrence = !recurrenceActive()),
                ),
                actionErrorRes = null,
            )
        }
    }

    private fun createPayment(method: String) {
        val charge = currentChargeOrNull() ?: return
        if (_uiState.value.creatingMethod != null) return
        _uiState.update { it.copy(creatingMethod = method, actionErrorRes = null) }
        viewModelScope.launch {
            val result = when (method) {
                METHOD_PIX -> repository.payPix(charge.id)
                else -> repository.payBoleto(charge.id)
            }
            when (result) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        creatingMethod = null,
                        sheet = when (method) {
                            METHOD_PIX -> PaymentSheet.Pix(
                                payment = result.value.payment,
                                charge = result.value.charge,
                            )
                            else -> PaymentSheet.Boleto(
                                payment = result.value.payment,
                                charge = result.value.charge,
                            )
                        },
                    )
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        creatingMethod = null,
                        actionErrorRes = result.error.toBillingMessageRes(),
                    )
                }
            }
        }
    }

    // ---- card form (aluno-15) --------------------------------------------

    fun updateCardNumber(raw: String) = updateCardForm {
        it.copy(number = raw.filter(Char::isDigit).take(CardFormState.MAX_CARD_DIGITS))
    }

    fun updateCardHolder(raw: String) = updateCardForm { it.copy(holderName = raw) }

    fun updateCardExpiry(raw: String) = updateCardForm {
        val digits = raw.filter(Char::isDigit).take(4)
        val formatted =
            if (digits.length > 2) "${digits.take(2)}/${digits.drop(2)}" else digits
        it.copy(expiry = formatted)
    }

    fun updateCardCvv(raw: String) = updateCardForm {
        it.copy(cvv = raw.filter(Char::isDigit).take(CardFormState.MAX_CVV_DIGITS))
    }

    fun toggleRecurrence() = updateCardForm { it.copy(recurrence = !it.recurrence) }

    private fun updateCardForm(transform: (CardFormState) -> CardFormState) =
        _uiState.update { state ->
            val sheet = state.sheet as? PaymentSheet.Card ?: return@update state
            if (sheet.submitting) state
            else state.copy(sheet = sheet.copy(form = transform(sheet.form), errorRes = null))
        }

    /** Cartão settles inline through the normalized-event handler (spec 006). */
    fun submitCard() {
        val sheet = _uiState.value.sheet as? PaymentSheet.Card ?: return
        if (sheet.submitting || !sheet.form.complete) return
        _uiState.update { it.copy(sheet = sheet.copy(submitting = true, errorRes = null)) }
        viewModelScope.launch {
            val result = repository.payCard(
                chargeId = sheet.charge.id,
                recurrence = sheet.form.recurrence,
                card = CardDetails(
                    holderName = sheet.form.holderName.trim(),
                    last4 = sheet.form.last4,
                ),
            )
            when (result) {
                is ApiResult.Success -> {
                    if (result.value.payment.status == PaymentStatuses.SUCCEEDED) {
                        settle(
                            periodStart = result.value.charge.periodStart,
                            mandateCreated = result.value.mandateCreated,
                        )
                    } else {
                        // Defensive: a non-inline settle just closes the sheet and reloads.
                        _uiState.update { it.copy(sheet = null) }
                        load()
                    }
                }
                is ApiResult.Failure -> _uiState.update { state ->
                    val current = state.sheet as? PaymentSheet.Card ?: return@update state
                    state.copy(
                        sheet = current.copy(
                            submitting = false,
                            errorRes = result.error.toBillingMessageRes(),
                        ),
                    )
                }
            }
        }
    }

    // ---- simulate (aluno-13/14, gated on the simulated provider) ---------

    fun simulate() {
        when (val sheet = _uiState.value.sheet) {
            is PaymentSheet.Pix -> if (!sheet.simulating && sheet.simulateAvailable) {
                _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
                runSimulate(sheet.payment.id)
            }
            is PaymentSheet.Boleto -> if (!sheet.simulating && sheet.simulateAvailable) {
                _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
                runSimulate(sheet.payment.id)
            }
            else -> Unit
        }
    }

    private fun runSimulate(paymentId: String) {
        viewModelScope.launch {
            when (val result = repository.simulate(paymentId)) {
                is ApiResult.Success ->
                    settle(periodStart = result.value.charge.periodStart, mandateCreated = false)
                is ApiResult.Failure -> _uiState.update { state ->
                    state.copy(
                        sheet = when (val sheet = state.sheet) {
                            is PaymentSheet.Pix -> sheet.copy(
                                simulating = false,
                                errorRes = result.error.toSimulateMessageRes(),
                            )
                            is PaymentSheet.Boleto -> sheet.copy(
                                simulating = false,
                                errorRes = result.error.toSimulateMessageRes(),
                            )
                            else -> sheet
                        },
                    )
                }
            }
        }
    }

    /** Success pop + silent wallet reload — the card flips to Paga (story 15). */
    private suspend fun settle(periodStart: String?, mandateCreated: Boolean) {
        _uiState.update {
            it.copy(
                sheet = PaymentSheet.Success(
                    periodStart = periodStart,
                    mandateCreated = mandateCreated,
                ),
            )
        }
        load()
    }

    // ---- recurrence cancel (BIL.19, story 14) ----------------------------

    fun cancelRecurrence() {
        if (_uiState.value.cancelingMandate) return
        _uiState.update { it.copy(cancelingMandate = true, actionErrorRes = null) }
        viewModelScope.launch {
            when (val result = repository.cancelMandate()) {
                is ApiResult.Success -> {
                    load()
                    _uiState.update { it.copy(cancelingMandate = false) }
                }
                is ApiResult.Failure -> {
                    // 404 = no active mandate — the banner is stale; reload resolves it.
                    val stale = result.error is ApiError.NotFound
                    if (stale) load()
                    _uiState.update {
                        it.copy(
                            cancelingMandate = false,
                            actionErrorRes =
                                if (stale) null else result.error.toBillingMessageRes(),
                        )
                    }
                }
            }
        }
    }

    // ---- comprovante (BIL.20) --------------------------------------------

    fun openReceipt(paymentId: String) {
        _uiState.update { it.copy(sheet = PaymentSheet.Receipt(ReceiptSheetState.Loading)) }
        viewModelScope.launch {
            val state = when (val result = repository.receipt(paymentId)) {
                is ApiResult.Success -> ReceiptSheetState.Loaded(result.value)
                is ApiResult.Failure ->
                    ReceiptSheetState.Error(result.error.toBillingMessageRes())
            }
            _uiState.update { current ->
                if (current.sheet is PaymentSheet.Receipt) {
                    current.copy(sheet = PaymentSheet.Receipt(state))
                } else {
                    current
                }
            }
        }
    }

    fun dismissSheet() = _uiState.update { it.copy(sheet = null) }

    // ---- helpers ---------------------------------------------------------

    private fun currentChargeOrNull() =
        (_uiState.value.wallet as? WalletState.Loaded)?.wallet?.currentCharge

    private fun recurrenceActive(): Boolean =
        (_uiState.value.wallet as? WalletState.Loaded)?.wallet?.recurrence?.active == true

    private companion object {
        const val METHOD_PIX = PaymentMethods.PIX
        const val METHOD_BOLETO = PaymentMethods.BOLETO
    }
}

/** [ChargeWithPayments] → its plain [Charge] view (sheet payloads carry no attempts). */
private fun ChargeWithPayments.toCharge() =
    Charge(
        id = id,
        studentId = studentId,
        guardianId = guardianId,
        status = status,
        overdue = overdue,
        amountCents = amountCents,
        currency = currency,
        dueDate = dueDate,
        periodStart = periodStart,
        periodEnd = periodEnd,
        academyPlanId = academyPlanId,
    )
