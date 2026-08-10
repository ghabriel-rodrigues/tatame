package br.com.tatame.feature.events.responsavel

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tatame.core.billing.BillingRepository
import br.com.tatame.core.events.EventsRepository
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.EventRegistrationState
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.core.network.dto.ResponsavelEvent
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

/** Eventos tab load state (EVT.13, responsavel-06). */
sealed interface EventosState {
    data object Loading : EventosState
    data class Error(@param:StringRes val messageRes: Int) : EventosState
    data class Loaded(val events: List<ResponsavelEvent>) : EventosState
}

data class EventosUiState(
    val events: EventosState = EventosState.Loading,
    val sheet: PaymentSheet? = null,
    /** (eventId, studentId) whose round trip is in flight — that chip spins. */
    val acting: Pair<String, String>? = null,
    /** (eventId, studentId) the mounted Pix sheet is paying for (settle target). */
    val paying: Pair<String, String>? = null,
    @param:StringRes val actionErrorRes: Int? = null,
)

/**
 * Responsável Eventos state machine (EVT.13, responsavel-06 + spec 008
 * stories 18–21): published events as gradient cards with one chip per
 * dependent, each dependent's state independent of their siblings'.
 *
 * Chip UX (documented decision — the prototype only renders the free
 * toggle): a TAP on a dependent chip performs the state's primary action —
 * free none/canceled → confirm; free confirmed → cancel (the prototype's
 * toggle); paid none/canceled → register + open the EXISTING Pix sheet
 * addressed "Inscrição · <evento> · <criança>" with the charge billed to the
 * guardian; paid pending → reopen the Pix sheet on the SAME open charge
 * (retry, never a duplicate registration); paid confirmed → inert (admin
 * refund only). A LONG-PRESS on a pending chip cancels the registration and
 * its open charge (spec story 15's guardian twin) — surfaced by the
 * screen's helper caption.
 */
class EventosViewModel(
    private val eventsRepository: EventsRepository,
    private val billingRepository: BillingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EventosUiState())
    val uiState: StateFlow<EventosUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(events = EventosState.Loading, actionErrorRes = null) }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    events = when (val result = eventsRepository.responsavelEvents()) {
                        is ApiResult.Success -> EventosState.Loaded(result.value.events)
                        is ApiResult.Failure ->
                            EventosState.Error(result.error.toEventsMessageRes())
                    },
                )
            }
        }
    }

    // ---- one tap per chip, action derived from state ---------------------

    fun tapDependent(eventId: String, studentId: String) {
        if (_uiState.value.acting != null) return
        val event = findEvent(eventId) ?: return
        val registration = event.dependents
            .firstOrNull { it.studentId == studentId }?.registration
        val status = activeStatus(registration)
        when {
            event.priceCents == null ->
                if (status == EventRegistrationStatuses.CONFIRMED) {
                    cancelRegistration(eventId, studentId)
                } else {
                    confirmFree(eventId, studentId)
                }

            status == EventRegistrationStatuses.CONFIRMED -> Unit // settled — admin refund only

            status == EventRegistrationStatuses.PENDING_PAYMENT ->
                registration?.chargeId?.let { openPixFor(eventId, studentId, it) }
                    ?: payDependent(eventId, studentId)

            else -> payDependent(eventId, studentId)
        }
    }

    /** Long-press: cancel a pending (or free confirmed) registration. */
    fun cancelDependent(eventId: String, studentId: String) {
        if (_uiState.value.acting != null) return
        val event = findEvent(eventId) ?: return
        val status = activeStatus(
            event.dependents.firstOrNull { it.studentId == studentId }?.registration,
        )
        if (status == null) return
        if (event.priceCents != null && status == EventRegistrationStatuses.CONFIRMED) return
        cancelRegistration(eventId, studentId)
    }

    private fun confirmFree(eventId: String, studentId: String) = act(eventId, studentId) {
        when (val result = eventsRepository.responsavelRegister(eventId, studentId)) {
            is ApiResult.Success ->
                applyRegistration(eventId, studentId, result.value.registration)
            is ApiResult.Failure -> fail(result.error.toEventsMessageRes())
        }
    }

    private fun cancelRegistration(eventId: String, studentId: String) = act(eventId, studentId) {
        when (val result = eventsRepository.responsavelCancelRegistration(eventId, studentId)) {
            is ApiResult.Success -> applyRegistrationUpdate(eventId, studentId) { current ->
                current?.copy(status = EventRegistrationStatuses.CANCELED, chargeId = null)
            }
            is ApiResult.Failure -> fail(result.error.toEventsMessageRes())
        }
    }

    /** Paid: register (guardian bill-to charge) then mount the Pix sheet. */
    private fun payDependent(eventId: String, studentId: String) = act(eventId, studentId) {
        when (val result = eventsRepository.responsavelRegister(eventId, studentId)) {
            is ApiResult.Success -> {
                applyRegistration(eventId, studentId, result.value.registration, keepActing = true)
                val chargeId = result.value.chargeId ?: result.value.registration.chargeId
                if (chargeId == null) {
                    fail(br.com.tatame.R.string.error_generic)
                } else {
                    createPixAttempt(eventId, studentId, chargeId)
                }
            }
            is ApiResult.Failure -> fail(result.error.toEventsMessageRes())
        }
    }

    private fun openPixFor(eventId: String, studentId: String, chargeId: String) =
        act(eventId, studentId) { createPixAttempt(eventId, studentId, chargeId) }

    private suspend fun createPixAttempt(eventId: String, studentId: String, chargeId: String) {
        when (val result = billingRepository.guardianPayPix(chargeId)) {
            is ApiResult.Success -> {
                val event = findEvent(eventId)
                val dependent = event?.dependents?.firstOrNull { it.studentId == studentId }
                _uiState.update {
                    it.copy(
                        acting = null,
                        paying = eventId to studentId,
                        sheet = PaymentSheet.Pix(
                            payment = result.value.payment,
                            charge = result.value.charge,
                            subtitle = EventFormat.inscricaoSubtitle(
                                eventName = event?.name.orEmpty(),
                                dependentName = dependent?.fullName,
                            ),
                        ),
                    )
                }
            }
            is ApiResult.Failure -> fail(result.error.toBillingMessageRes())
        }
    }

    // ---- simulate (gated on the simulated provider) ----------------------

    /** Settle confirms that dependent's chip — check appears, sheet closes. */
    fun simulate() {
        val sheet = _uiState.value.sheet as? PaymentSheet.Pix ?: return
        if (sheet.simulating || !sheet.simulateAvailable) return
        _uiState.update { it.copy(sheet = sheet.copy(simulating = true, errorRes = null)) }
        viewModelScope.launch {
            when (val result = billingRepository.simulate(sheet.payment.id)) {
                is ApiResult.Success -> {
                    val target = _uiState.value.paying
                    _uiState.update { it.copy(sheet = null, paying = null) }
                    target?.let { (eventId, studentId) ->
                        applyRegistrationUpdate(eventId, studentId) { current ->
                            current?.copy(
                                status = EventRegistrationStatuses.CONFIRMED,
                                chargeId = null,
                            )
                        }
                    }
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

    fun dismissSheet() = _uiState.update { it.copy(sheet = null, paying = null) }

    // ---- helpers ---------------------------------------------------------

    /** Canceled rows behave as none — the row is reused on re-confirm. */
    private fun activeStatus(registration: EventRegistrationState?): String? =
        registration?.status?.takeIf { it != EventRegistrationStatuses.CANCELED }

    private fun findEvent(eventId: String): ResponsavelEvent? =
        (_uiState.value.events as? EventosState.Loaded)?.events
            ?.firstOrNull { it.id == eventId }

    private fun act(eventId: String, studentId: String, block: suspend () -> Unit) {
        _uiState.update { it.copy(acting = eventId to studentId, actionErrorRes = null) }
        viewModelScope.launch { block() }
    }

    private fun fail(@StringRes messageRes: Int) = _uiState.update {
        it.copy(acting = null, actionErrorRes = messageRes)
    }

    private fun applyRegistration(
        eventId: String,
        studentId: String,
        registration: EventRegistrationState,
        keepActing: Boolean = false,
    ) = applyRegistrationUpdate(eventId, studentId, keepActing) { registration }

    /** Flips ONE dependent's row on ONE event — siblings stay untouched (story 21). */
    private fun applyRegistrationUpdate(
        eventId: String,
        studentId: String,
        keepActing: Boolean = false,
        transform: (EventRegistrationState?) -> EventRegistrationState?,
    ) = _uiState.update { state ->
        val loaded = state.events as? EventosState.Loaded ?: return@update state
        state.copy(
            acting = if (keepActing) state.acting else null,
            events = EventosState.Loaded(
                loaded.events.map { event ->
                    if (event.id != eventId) return@map event
                    event.copy(
                        dependents = event.dependents.map { dependent ->
                            if (dependent.studentId != studentId) {
                                dependent
                            } else {
                                dependent.copy(registration = transform(dependent.registration))
                            }
                        },
                    )
                },
            ),
        )
    }
}
