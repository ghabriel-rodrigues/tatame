package br.com.tatame.feature.agenda

import androidx.annotation.StringRes
import br.com.tatame.R
import br.com.tatame.core.network.ApiError

/**
 * PT-BR copy for agenda-slice failures (AGD.7/8). The surface is read-only
 * GETs, so only transport/status buckets are reachable — stable codes,
 * never human text (same doctrine as the sibling error mappers).
 */
@StringRes
internal fun ApiError.toAgendaMessageRes(): Int = when (this) {
    is ApiError.Network -> R.string.error_network
    is ApiError.Timeout -> R.string.error_timeout
    is ApiError.NotFound -> R.string.error_not_found
    is ApiError.Validation -> R.string.error_form_invalid
    else -> R.string.error_generic
}
