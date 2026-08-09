package br.com.tatame.feature.billing

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ProblemDetails
import br.com.tatame.core.network.mapProblem
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Spec 006 — billing.* stable codes map to the sealed surface and to PT-BR
 * copy (codes, never human text; unknown growth never crashes).
 */
class BillingErrorsTest {

    private fun problem(code: String, status: Int = 422) =
        ProblemDetails(status = status, code = code)

    @Test
    fun `billing codes map to the sealed billing surface`() {
        assertEquals(
            ApiError.Billing.ChargeNotPayable,
            mapProblem(422, problem("billing.charge_not_payable")),
        )
        assertEquals(
            ApiError.Billing.MethodMandateMismatch,
            mapProblem(422, problem("billing.method_mandate_mismatch")),
        )
        assertEquals(
            ApiError.Billing.MandateAlreadyActive,
            mapProblem(409, problem("billing.mandate_already_active", status = 409)),
        )
        assertEquals(
            ApiError.Billing.RefundUnsettled,
            mapProblem(422, problem("billing.refund_unsettled")),
        )
        assertEquals(
            ApiError.Billing.SimulateUnavailable,
            mapProblem(422, problem("billing.simulate_unavailable")),
        )
    }

    @Test
    fun `billing errors map to PT-BR copy`() {
        assertEquals(
            R.string.error_billing_charge_not_payable,
            ApiError.Billing.ChargeNotPayable.toBillingMessageRes(),
        )
        assertEquals(
            R.string.error_billing_method_mandate_mismatch,
            ApiError.Billing.MethodMandateMismatch.toBillingMessageRes(),
        )
        assertEquals(
            R.string.error_billing_mandate_already_active,
            ApiError.Billing.MandateAlreadyActive.toBillingMessageRes(),
        )
        assertEquals(
            R.string.error_billing_simulate_unavailable,
            ApiError.Billing.SimulateUnavailable.toBillingMessageRes(),
        )
        // Admin-only refund code falls through to the generic bucket on mobile.
        assertEquals(
            R.string.error_generic,
            ApiError.Billing.RefundUnsettled.toBillingMessageRes(),
        )
        assertEquals(R.string.error_read_only, ApiError.Tenant.ReadOnly.toBillingMessageRes())
        assertEquals(R.string.error_network, ApiError.Network.toBillingMessageRes())
        assertEquals(R.string.error_not_found, ApiError.NotFound.toBillingMessageRes())
    }

    @Test
    fun `simulate mapping reads a 404 as unavailable not missing`() {
        assertEquals(
            R.string.error_billing_simulate_unavailable,
            ApiError.NotFound.toSimulateMessageRes(),
        )
        assertEquals(R.string.error_timeout, ApiError.Timeout.toSimulateMessageRes())
    }
}
