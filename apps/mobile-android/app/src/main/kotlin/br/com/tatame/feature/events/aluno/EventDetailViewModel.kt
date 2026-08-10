package br.com.tatame.feature.events.aluno

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.events.EventsRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.AlunoEventDetailResponse
import br.com.tatame.core.network.dto.EventRegistrationState
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.feature.billing.toBillingMessageRes
import br.com.tatame.feature.billing.toSimulateMessageRes
import br.com.tatame.feature.events.EventFormat
import br.com.tatame.feature.events.toEventsMessageRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Detail load state (EVT.12, aluno-10). */
sealed interface EventDetailState {
    data object Loading : EventDetailState
    data class Error(@param:StringRes val messageRes: Int) : EventDetailState
    data class Loaded(val event: AlunoEventDetailResponse) : EventDetailState
}

data class EventDetailUiState(
    val detail: EventDetailState = EventDetailState.Loading,
    /** The existing Pix sheet, addressed "Inscrição · <evento>" (spec 008). */
    val sheet: PaymentSheet? = null,
    /** A confirm/cancel/register round trip is in flight (CTA spinner). */
    val acting: Boolean = false,
    @param:StringRes val actionErrorRes: Int? = null,
)

/**
 * Aluno event detail state machine (EVT.12, aluno-10 + spec 008 stories
 * 11–15): free confirm/cancel flips the registration row in place; the paid
 * path registers (`pending_payment` + event-origin charge) and drives the
 * EXISTING billing rails — same Pix sheet, same wallet payment endpoint, same
 * gated simulate. A settled simulate confirms the registration locally (the
 * server flipped it through the normalized-event handler), so the green
 * "Presença confirmada — até lá!" banner replaces the sheet — no
 * mensalidade-worded success pop on an event charge. A pending retry reuses
 * the registration's open `chargeId`, never re-registering.
 */
class EventDetailViewModel(
    private val eventId: String,
    private val eventsRepository: EventsRepository,
    private val billingRepository: BillingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EventDetailUiState())
    val uiState: StateFlow<EventDetailUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(detail = EventDetailState.Loading, actionErrorRes = null) }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    detail = when (val result = eventsRepository.alunoEventDetail(eventId)) {
                        is ApiResult.Success -> EventDetailState.Loaded(result.value)
                        is ApiResult.Failure ->
                            EventDetailState.Error(result.error.toEventsMessageRes())
                    },
                )
            }
        }
    }

    // ---- free flow: confirm / cancel (stories 12 + 15) -------------------

    /** "Confirmar presença" — gratuito = one tap, row flips to confirmed. */
    fun confirm() {
        val event = loadedEvent() ?: return
        if (_uiState.value.acting || event.priceCents != null) return
        act {
            when (val result = eventsRepository.alunoRegister(eventId)) {
                is ApiResult.Success -> applyRegistration(result.value.registration)
                is ApiResult.Failure -> fail(result.error.toEventsMessageRes())
            }
        }
    }

    /** "Cancelar participação" — free confirmed or paid pending (charge canceled server-side). */
    fun cancel() {
        val event = loadedEvent() ?: return
        if (_uiState.value.acting) return
        act {
            when (val result = eventsRepository.alunoCancelRegistration(eventId)) {
                is ApiResult.Success -> applyRegistration(
                    event.registration?.copy(
                        status = EventRegistrationStatuses.CANCELED,
                        chargeId = null,
                    ),
                )
                is ApiResult.Failure -> fail(result.error.toEventsMessageRes())
            }
        }
    }

    // ---- paid flow over the existing billing rails (stories 13 + 14) -----

    /**
     * "Pagar inscrição · R$ X": reuse the pending registration's open charge
     * when there is one, otherwise register first (creates the event-origin
     * charge), then create the Pix attempt on the existing wallet endpoint
     * and mount the existing sheet.
     */
    fun pay() {
        val event = loadedEvent() ?: return
        if (_uiState.value.acting || event.priceCents == null) return
        act {
            val openChargeId = event.registration
                ?.takeIf { it.status == EventRegistrationStatuses.PENDING_PAYMENT }
                ?.chargeId
            val chargeId = openChargeId ?: when (
                val result = eventsRepository.alunoRegister(eventId)
            ) {
                is ApiResult.Success -> {
                    applyRegistration(result.value.registration)
                    result.value.chargeId ?: result.value.registration.chargeId
                }
                is ApiResult.Failure -> {
                    fail(result.error.toEventsMessageRes())
                    return@act
                }
            }
            if (chargeId == null) {
                fail(result = null)
                return@act
            }
            when (val payment = billingRepository.payPix(chargeId)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        acting = false,
                        sheet = PaymentSheet.Pix(
                            payment = payment.value.payment,
                            charge = payment.value.charge,
                            subtitle = EventFormat.inscricaoSubtitle(event.name),
                        ),
                    )
                }
                is ApiResult.Failure -> fail(payment.error.toBillingMessageRes())
            }
        }
    }

    /** "Simular pagamento" — settle confirms the inscription (story 14). */
    fun simulate() {
        val sheet = _uiState.value.sheet as? PaymentSheet.Pix ?: return
        if (sheet.simulating || !sheet.simulateAvailable) return
        _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = billingRepository.simulate(sheet.payment.id)) {
                is ApiResult.Success -> _uiState.update { state ->
                    // The handler confirmed the registration server-side; the
                    // detail flips to the confirmed banner (spec story 14).
                    state.copy(
                        sheet = null,
                        detail = withRegistration(
                            state.detail,
                            loadedEvent(state)?.registration?.copy(
                                status = EventRegistrationStatuses.CONFIRMED,
                                chargeId = null,
                            ),
                        ),
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

    fun dismissSheet() = _uiState.update { it.copy(sheet = null) }

    // ---- helpers ---------------------------------------------------------

    private fun loadedEvent(state: EventDetailUiState = _uiState.value): AlunoEventDetailResponse? =
        (state.detail as? EventDetailState.Loaded)?.event

    private fun act(block: suspend () -> Unit) {
        _uiState.update { it.copy(acting = true, actionErrorRes = null) }
        viewModelScope.launch { block() }
    }

    private fun applyRegistration(registration: EventRegistrationState?) =
        _uiState.update {
            it.copy(acting = false, detail = withRegistration(it.detail, registration))
        }

    private fun fail(@StringRes result: Int?) = _uiState.update {
        it.copy(
            acting = false,
            actionErrorRes = result ?: br.com.tatame.R.string.error_generic,
        )
    }

    private fun withRegistration(
        detail: EventDetailState,
        registration: EventRegistrationState?,
    ): EventDetailState = when (detail) {
        is EventDetailState.Loaded ->
            EventDetailState.Loaded(detail.event.copy(registration = registration))
        else -> detail
    }
}
