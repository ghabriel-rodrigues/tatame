package br.com.tatame.feature.events.aluno

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.testutil.FakeBillingRepository
import br.com.tatame.testutil.FakeEventsRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.charge
import br.com.tatame.testutil.eventDetail
import br.com.tatame.testutil.payment
import br.com.tatame.testutil.paymentCreated
import br.com.tatame.testutil.registerResponse
import br.com.tatame.testutil.registrationState
import br.com.tatame.testutil.simulateResponse
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * EVT.12 — the aluno event-detail state machine (spec 008 stories 11–15):
 * free confirm/cancel in place, the paid round trip over the EXISTING billing
 * rails (register → Pix sheet → simulate → confirmed), pending retry on the
 * same charge, and PT-BR error surfacing on stable codes.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EventDetailViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val events = FakeEventsRepository()
    private val billing = FakeBillingRepository()

    private fun viewModel(eventId: String = "ev1") =
        EventDetailViewModel(eventId, events, billing)

    private fun loadedEvent(vm: EventDetailViewModel) =
        (vm.uiState.value.detail as EventDetailState.Loaded).event

    // ---- load ------------------------------------------------------------

    @Test
    fun `loads the detail for the routed event id`() = runTest {
        events.detailResult = ApiResult.Success(eventDetail(id = "ev9"))
        val vm = viewModel(eventId = "ev9")
        advanceUntilIdle()

        assertEquals(listOf("ev9"), events.detailCalls)
        assertEquals("Open mat de verão", loadedEvent(vm).name)
    }

    @Test
    fun `load failure maps the events stable code to PT-BR copy`() = runTest {
        events.detailResult = ApiResult.Failure(ApiError.Events.NotPublished)
        val vm = viewModel()
        advanceUntilIdle()

        val error = vm.uiState.value.detail as EventDetailState.Error
        assertEquals(R.string.error_event_not_published, error.messageRes)
    }

    // ---- free flow (stories 12 + 15) -------------------------------------

    @Test
    fun `free confirm flips the registration to confirmed on the spot`() = runTest {
        events.detailResult = ApiResult.Success(eventDetail(priceCents = null))
        events.registerResult = ApiResult.Success(
            registerResponse(status = EventRegistrationStatuses.CONFIRMED),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.confirm()
        advanceUntilIdle()

        assertEquals(listOf("ev1"), events.registerCalls)
        assertEquals(
            EventRegistrationStatuses.CONFIRMED,
            loadedEvent(vm).registration?.status,
        )
        assertTrue(billing.payPixCalls.isEmpty()) // gratuito never touches billing
    }

    @Test
    fun `cancel flips the same row to canceled`() = runTest {
        events.detailResult = ApiResult.Success(
            eventDetail(priceCents = null, registration = registrationState()),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.cancel()
        advanceUntilIdle()

        assertEquals(listOf("ev1"), events.cancelCalls)
        assertEquals(
            EventRegistrationStatuses.CANCELED,
            loadedEvent(vm).registration?.status,
        )
    }

    @Test
    fun `settled self-cancel surfaces the registration_settled copy`() = runTest {
        events.detailResult = ApiResult.Success(
            eventDetail(priceCents = null, registration = registrationState()),
        )
        events.cancelResult = ApiResult.Failure(ApiError.Events.RegistrationSettled)
        val vm = viewModel()
        advanceUntilIdle()

        vm.cancel()
        advanceUntilIdle()

        assertEquals(
            R.string.error_event_registration_settled,
            vm.uiState.value.actionErrorRes,
        )
    }

    // ---- paid flow over the existing rails (stories 13 + 14) -------------

    @Test
    fun `paid register creates the charge and mounts the Pix sheet addressed Inscricao`() =
        runTest {
            events.detailResult = ApiResult.Success(eventDetail(priceCents = 6_000))
            events.registerResult = ApiResult.Success(
                registerResponse(
                    status = EventRegistrationStatuses.PENDING_PAYMENT,
                    chargeId = "ch-ev1",
                ),
            )
            billing.payPixResult = ApiResult.Success(
                paymentCreated(payment = payment(chargeId = "ch-ev1"), charge = charge(id = "ch-ev1")),
            )
            val vm = viewModel()
            advanceUntilIdle()

            vm.pay()
            advanceUntilIdle()

            assertEquals(listOf("ev1"), events.registerCalls)
            assertEquals(listOf("ch-ev1"), billing.payPixCalls)
            val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
            assertEquals("Inscrição · Open mat de verão", sheet.subtitle)
            assertEquals(
                EventRegistrationStatuses.PENDING_PAYMENT,
                loadedEvent(vm).registration?.status,
            )
        }

    @Test
    fun `pending retry reuses the open charge and never re-registers`() = runTest {
        events.detailResult = ApiResult.Success(
            eventDetail(
                priceCents = 6_000,
                registration = registrationState(
                    status = EventRegistrationStatuses.PENDING_PAYMENT,
                    chargeId = "ch-open",
                ),
            ),
        )
        billing.payPixResult = ApiResult.Success(paymentCreated())
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay()
        advanceUntilIdle()

        assertTrue(events.registerCalls.isEmpty())
        assertEquals(listOf("ch-open"), billing.payPixCalls)
        assertTrue(vm.uiState.value.sheet is PaymentSheet.Pix)
    }

    @Test
    fun `simulate settles the inscription — sheet closes and registration confirms`() = runTest {
        events.detailResult = ApiResult.Success(eventDetail(priceCents = 6_000))
        events.registerResult = ApiResult.Success(
            registerResponse(
                status = EventRegistrationStatuses.PENDING_PAYMENT,
                chargeId = "ch-ev1",
            ),
        )
        billing.payPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Success(simulateResponse())
        val vm = viewModel()
        advanceUntilIdle()

        // The full paid round trip: register → Pix sheet → simulate → confirmed.
        vm.pay()
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        assertEquals(listOf("pay1"), billing.simulateCalls)
        assertNull(vm.uiState.value.sheet)
        assertEquals(
            EventRegistrationStatuses.CONFIRMED,
            loadedEvent(vm).registration?.status,
        )
    }

    @Test
    fun `simulate failure keeps the sheet open with the simulate copy`() = runTest {
        events.detailResult = ApiResult.Success(eventDetail(priceCents = 6_000))
        events.registerResult = ApiResult.Success(
            registerResponse(
                status = EventRegistrationStatuses.PENDING_PAYMENT,
                chargeId = "ch-ev1",
            ),
        )
        billing.payPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Failure(ApiError.Billing.SimulateUnavailable)
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay()
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
        assertEquals(R.string.error_billing_simulate_unavailable, sheet.errorRes)
        assertEquals(
            "settle never applied on failure",
            EventRegistrationStatuses.PENDING_PAYMENT,
            loadedEvent(vm).registration?.status,
        )
    }

    @Test
    fun `register failure on a closed event surfaces the not_published copy`() = runTest {
        events.detailResult = ApiResult.Success(eventDetail(priceCents = 6_000))
        events.registerResult = ApiResult.Failure(ApiError.Events.NotPublished)
        val vm = viewModel()
        advanceUntilIdle()

        vm.pay()
        advanceUntilIdle()

        assertEquals(R.string.error_event_not_published, vm.uiState.value.actionErrorRes)
        assertNull(vm.uiState.value.sheet)
        assertTrue(billing.payPixCalls.isEmpty())
    }
}
