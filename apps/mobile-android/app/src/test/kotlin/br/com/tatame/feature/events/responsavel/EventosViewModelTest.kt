package br.com.tatame.feature.events.responsavel

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.feature.billing.PaymentSheet
import br.com.tatame.testutil.FakeBillingRepository
import br.com.tatame.testutil.FakeEventsRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.paymentCreated
import br.com.tatame.testutil.registerResponse
import br.com.tatame.testutil.registrationState
import br.com.tatame.testutil.responsavelDependent
import br.com.tatame.testutil.responsavelEvent
import br.com.tatame.testutil.responsavelEvents
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
 * EVT.13 — the responsável per-dependent confirmation machine (spec 008
 * stories 18–21): the free chip toggle, the paid per-dependent Pix flow
 * billed to the guardian, pending resume on the same charge, long-press
 * cancel, and per-child state independence.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EventosViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val events = FakeEventsRepository()
    private val billing = FakeBillingRepository()

    private fun viewModel() = EventosViewModel(events, billing)

    private fun dependentRegistration(vm: EventosViewModel, eventId: String, studentId: String) =
        (vm.uiState.value.events as EventosState.Loaded).events
            .first { it.id == eventId }
            .dependents.first { it.studentId == studentId }
            .registration

    // ---- load ------------------------------------------------------------

    @Test
    fun `loads the published events with per-dependent chips`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(responsavelEvent()),
        )
        val vm = viewModel()
        advanceUntilIdle()

        assertEquals(1, events.responsavelEventsCalls)
        val loaded = vm.uiState.value.events as EventosState.Loaded
        assertEquals(2, loaded.events.single().dependents.size)
    }

    // ---- free toggle (stories 18 + 19) -----------------------------------

    @Test
    fun `free chip tap confirms that dependent only`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(responsavelEvent(priceCents = null)),
        )
        events.responsavelRegisterResult = ApiResult.Success(
            registerResponse(status = EventRegistrationStatuses.CONFIRMED),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.tapDependent("ev1", "dst1")
        advanceUntilIdle()

        assertEquals(listOf("ev1" to "dst1"), events.responsavelRegisterCalls)
        assertEquals(
            EventRegistrationStatuses.CONFIRMED,
            dependentRegistration(vm, "ev1", "dst1")?.status,
        )
        // Pedro confirmed never implies Júlia confirmed (story 21).
        assertNull(dependentRegistration(vm, "ev1", "dst2"))
        assertTrue(billing.guardianPayPixCalls.isEmpty())
    }

    @Test
    fun `free chip tap on a confirmed dependent cancels — the prototype toggle`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(
                responsavelEvent(
                    priceCents = null,
                    dependents = listOf(
                        responsavelDependent(registration = registrationState()),
                        responsavelDependent(studentId = "dst2", fullName = "Júlia Silveira"),
                    ),
                ),
            ),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.tapDependent("ev1", "dst1")
        advanceUntilIdle()

        assertEquals(listOf("ev1" to "dst1"), events.responsavelCancelCalls)
        assertEquals(
            EventRegistrationStatuses.CANCELED,
            dependentRegistration(vm, "ev1", "dst1")?.status,
        )
    }

    // ---- paid per dependent (story 20) -----------------------------------

    @Test
    fun `paid chip tap registers the dependent and opens the Pix sheet addressed to the child`() =
        runTest {
            events.responsavelEventsResult = ApiResult.Success(
                responsavelEvents(responsavelEvent(priceCents = 6_000)),
            )
            events.responsavelRegisterResult = ApiResult.Success(
                registerResponse(
                    status = EventRegistrationStatuses.PENDING_PAYMENT,
                    chargeId = "ch-ev1-dst1",
                ),
            )
            billing.guardianPayPixResult = ApiResult.Success(paymentCreated())
            val vm = viewModel()
            advanceUntilIdle()

            vm.tapDependent("ev1", "dst1")
            advanceUntilIdle()

            assertEquals(listOf("ev1" to "dst1"), events.responsavelRegisterCalls)
            // The charge rides the guardian rails — billed to the responsável.
            assertEquals(listOf("ch-ev1-dst1"), billing.guardianPayPixCalls)
            val sheet = vm.uiState.value.sheet as PaymentSheet.Pix
            assertEquals("Inscrição · Festival Kids · Pedro", sheet.subtitle)
        }

    @Test
    fun `pending chip tap resumes payment on the same charge without re-registering`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(
                responsavelEvent(
                    priceCents = 6_000,
                    dependents = listOf(
                        responsavelDependent(
                            registration = registrationState(
                                status = EventRegistrationStatuses.PENDING_PAYMENT,
                                chargeId = "ch-open",
                            ),
                        ),
                    ),
                ),
            ),
        )
        billing.guardianPayPixResult = ApiResult.Success(paymentCreated())
        val vm = viewModel()
        advanceUntilIdle()

        vm.tapDependent("ev1", "dst1")
        advanceUntilIdle()

        assertTrue(events.responsavelRegisterCalls.isEmpty())
        assertEquals(listOf("ch-open"), billing.guardianPayPixCalls)
    }

    @Test
    fun `paid confirmed chip is inert — admin refund only`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(
                responsavelEvent(
                    priceCents = 6_000,
                    dependents = listOf(responsavelDependent(registration = registrationState())),
                ),
            ),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.tapDependent("ev1", "dst1")
        vm.cancelDependent("ev1", "dst1") // long-press equally refuses
        advanceUntilIdle()

        assertTrue(events.responsavelRegisterCalls.isEmpty())
        assertTrue(events.responsavelCancelCalls.isEmpty())
        assertTrue(billing.guardianPayPixCalls.isEmpty())
    }

    @Test
    fun `simulate settles the dependent inscription — chip confirms and sheet closes`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(responsavelEvent(priceCents = 6_000)),
        )
        events.responsavelRegisterResult = ApiResult.Success(
            registerResponse(
                status = EventRegistrationStatuses.PENDING_PAYMENT,
                chargeId = "ch-ev1-dst1",
            ),
        )
        billing.guardianPayPixResult = ApiResult.Success(paymentCreated())
        billing.simulateResult = ApiResult.Success(simulateResponse())
        val vm = viewModel()
        advanceUntilIdle()

        // Paid round trip per dependent: register → Pix → simulate → check.
        vm.tapDependent("ev1", "dst1")
        advanceUntilIdle()
        vm.simulate()
        advanceUntilIdle()

        assertEquals(listOf("pay1"), billing.simulateCalls)
        assertNull(vm.uiState.value.sheet)
        assertEquals(
            EventRegistrationStatuses.CONFIRMED,
            dependentRegistration(vm, "ev1", "dst1")?.status,
        )
        assertNull(dependentRegistration(vm, "ev1", "dst2")) // sibling untouched
    }

    @Test
    fun `long-press cancels a pending registration and its open charge`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(
                responsavelEvent(
                    priceCents = 6_000,
                    dependents = listOf(
                        responsavelDependent(
                            registration = registrationState(
                                status = EventRegistrationStatuses.PENDING_PAYMENT,
                                chargeId = "ch-open",
                            ),
                        ),
                    ),
                ),
            ),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.cancelDependent("ev1", "dst1")
        advanceUntilIdle()

        assertEquals(listOf("ev1" to "dst1"), events.responsavelCancelCalls)
        assertEquals(
            EventRegistrationStatuses.CANCELED,
            dependentRegistration(vm, "ev1", "dst1")?.status,
        )
    }

    @Test
    fun `register failure surfaces the PT-BR copy on the tab`() = runTest {
        events.responsavelEventsResult = ApiResult.Success(
            responsavelEvents(responsavelEvent(priceCents = null)),
        )
        events.responsavelRegisterResult = ApiResult.Failure(ApiError.Events.NotPublished)
        val vm = viewModel()
        advanceUntilIdle()

        vm.tapDependent("ev1", "dst1")
        advanceUntilIdle()

        assertEquals(R.string.error_event_not_published, vm.uiState.value.actionErrorRes)
        assertNull(vm.uiState.value.acting)
    }
}
