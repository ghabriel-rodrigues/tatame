package br.com.tatame.feature.billing

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for billing-slice failures (BIL.19–21). Branches on the sealed
 * [ApiError] surface — stable codes, never human text. The refund code
 * belongs to the admin web console and falls through to the generic bucket;
 * a 404 on simulate means the provider is not simulated (the button should
 * not have rendered) and reads as "unavailable", not "not found".
 */
@StringRes
internal fun ApiError.toBillingMessageRes(): Int = when (this) {
    is ApiError.Billing.ChargeNotPayable -> R.string.error_billing_charge_not_payable
    is ApiError.Billing.MethodMandateMismatch -> R.string.error_billing_method_mandate_mismatch
    is ApiError.Billing.MandateAlreadyActive -> R.string.error_billing_mandate_already_active
    is ApiError.Billing.SimulateUnavailable -> R.string.error_billing_simulate_unavailable
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}

/** Simulate-specific mapping: the gated route 404s when the provider is real. */
@StringRes
internal fun ApiError.toSimulateMessageRes(): Int = when (this) {
    is ApiError.NotFound -> R.string.error_billing_simulate_unavailable
    else -> toBillingMessageRes()
}
