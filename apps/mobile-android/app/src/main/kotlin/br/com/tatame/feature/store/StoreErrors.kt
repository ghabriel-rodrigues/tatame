package br.com.tatame.feature.store

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for store-slice failures (STO.12/13). Branches on the sealed
 * [ApiError] surface — stable codes, never human text (same doctrine as the
 * sibling error mappers). `store.order_invalid_transition` belongs to the
 * admin web console and falls through to the generic bucket.
 */
@StringRes
internal fun ApiError.toStoreMessageRes(): Int = when (this) {
    is ApiError.Store.InsufficientStock -> R.string.error_store_insufficient_stock
    is ApiError.Store.SizeRequired -> R.string.error_store_size_required
    is ApiError.Store.SizeInvalid -> R.string.error_store_size_invalid
    is ApiError.Store.ProductNotPurchasable -> R.string.error_store_product_not_purchasable
    is ApiError.Store.OrderNotCancelable -> R.string.error_store_order_not_cancelable
    is ApiError.Billing.ChargeNotPayable -> R.string.error_billing_charge_not_payable
    is ApiError.Tenant.ReadOnly -> R.string.error_read_only
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}
