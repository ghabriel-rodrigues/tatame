package br.com.tatame.feature.events

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for events-slice failures (EVT.12/13). Branches on the sealed
 * [ApiError] surface — stable codes, never human text (same doctrine as the
 * sibling error mappers). `event.publish_requirements` belongs to the admin
 * web console and falls through to the generic bucket.
 */
@StringRes
internal fun ApiError.toEventsMessageRes(): Int = when (this) {
    is ApiError.Events.NotPublished -> R.string.error_event_not_published
    is ApiError.Events.RegistrationSettled -> R.string.error_event_registration_settled
    is ApiError.Billing.ChargeNotPayable -> R.string.error_billing_charge_not_payable
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}
