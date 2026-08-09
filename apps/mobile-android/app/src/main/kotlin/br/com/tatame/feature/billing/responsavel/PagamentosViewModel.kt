package br.com.tatame.feature.billing.responsavel

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.GuardianPaymentsResponse
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.ReceiptSheetState
import br.com.tatame.feature.billing.toBillingMessageRes
import br.com.tatame.feature.billing.toSimulateMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Pagamentos load state (BIL.21, responsavel-04). */
sealed interface PagamentosState {
    data object Loading : PagamentosState
    data class Error(@param:StringRes val messageRes: Int) : PagamentosState
    data class Loaded(val payments: GuardianPaymentsResponse) : PagamentosState
}

data class PagamentosUiState(
    val payments: PagamentosState = PagamentosState.Loading,
    val sheet: PaymentSheet? = null,
    /** Charge id whose Pix create is in flight (per-card button spinner). */
    val creatingChargeId: String? = null,
    @param:StringRes val actionErrorRes: Int? = null,
)

/**
 * Responsável Pagamentos state machine (BIL.21): per-dependent mensalidade
 * cards (the server materializes the dependents' cycle on read), Pix per
 * dependent addressed to the child (responsavel-05), simulate settlement
 * (gated on the simulated provider), consolidated Histórico, and the
 * comprovante sheet. The design offers Pix only on this surface —
 * boleto/cartão stay on the aluno Carteira.
 */
class PagamentosViewModel(private val repository: BillingRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(PagamentosUiState())
    val uiState: StateFlow<PagamentosUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(payments = PagamentosState.Loading, actionErrorRes = null) }
        viewModelScope.launch { load() }
    }

    /** Post-settle reload keeps the Loaded cards on screen until fresh data lands. */
    private suspend fun load() {
        val state = when (val result = repository.guardianPayments()) {
            is ApiResult.Success -> PagamentosState.Loaded(result.value)
            is ApiResult.Failure -> PagamentosState.Error(result.error.toBillingMessageRes())
        }
        _uiState.update { it.copy(payments = state) }
    }

    // ---- Pix per dependent (responsavel-05) ------------------------------

    fun payWithPix(studentId: String) {
        val loaded = (_uiState.value.payments as? PagamentosState.Loaded)?.payments ?: return
        val dependent = loaded.dependents.firstOrNull { it.studentId == studentId } ?: return
        val charge = dependent.currentCharge ?: return
        if (_uiState.value.creatingChargeId != null) return
        _uiState.update { it.copy(creatingChargeId = charge.id, actionErrorRes = null) }
        viewModelScope.launch {
            when (val result = repository.guardianPayPix(charge.id)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        creatingChargeId = null,
                        sheet = PaymentSheet.Pix(
                            payment = result.value.payment,
                            charge = result.value.charge,
                            dependentName = dependent.fullName,
                        ),
                    )
                }
                is ApiResult.Failure -> _uiState.update {
                    it.copy(
                        creatingChargeId = null,
                        actionErrorRes = result.error.toBillingMessageRes(),
                    )
                }
            }
        }
    }

    // ---- simulate (gated on the simulated provider) ----------------------

    fun simulate() {
        val sheet = _uiState.value.sheet as? PaymentSheet.Pix ?: return
        if (sheet.simulating || !sheet.simulateAvailable) return
        _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = repository.simulate(sheet.payment.id)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            sheet = PaymentSheet.Success(
                                periodStart = result.value.charge.periodStart,
                            ),
                        )
                    }
                    load()
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

    // ---- comprovante -----------------------------------------------------

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
}
