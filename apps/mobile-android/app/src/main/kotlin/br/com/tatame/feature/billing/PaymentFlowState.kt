package br.com.tatame.feature.billing

import androidx.annotation.StringRes
import br.com.tatame.core.network.dto.Charge
import br.com.tatame.core.network.dto.Payment
import br.com.tatame.core.network.dto.PaymentProviders
import br.com.tatame.core.network.dto.ReceiptResponse

/**
 * Card sheet form (aluno-15). Display metadata only — the number never leaves
 * the device; `last4` is derived client-side for the API's [CardDetails]
 * snapshot (spec 006: no PAN in v1, the simulated provider charges by id).
 */
data class CardFormState(
    val number: String = "",
    val holderName: String = "",
    val expiry: String = "",
    val cvv: String = "",
    val recurrence: Boolean = false,
) {
    val last4: String get() = number.takeLast(4)
    val complete: Boolean
        get() = number.length >= MIN_CARD_DIGITS &&
            holderName.isNotBlank() &&
            expiry.length == EXPIRY_LENGTH &&
            cvv.length >= MIN_CVV_DIGITS

    companion object {
        const val MIN_CARD_DIGITS = 13
        const val MAX_CARD_DIGITS = 19
        const val EXPIRY_LENGTH = 5 // "MM/AA"
        const val MIN_CVV_DIGITS = 3
        const val MAX_CVV_DIGITS = 4
    }
}

/** Comprovante sheet load state. */
sealed interface ReceiptSheetState {
    data object Loading : ReceiptSheetState
    data class Error(@param:StringRes val messageRes: Int) : ReceiptSheetState
    data class Loaded(val receipt: ReceiptResponse) : ReceiptSheetState
}

/**
 * The one visible billing bottom sheet (aluno-13/14/15 + comprovante +
 * success pop). Pix/boleto carry the created pending attempt whose
 * `providerData` snapshot the sheet renders; `simulateAvailable` gates the
 * "Simular pagamento" button on the simulated provider (spec 006, story 44).
 */
sealed interface PaymentSheet {

    data class Pix(
        val payment: Payment,
        val charge: Charge,
        val dependentName: String? = null, // responsável flow: sheet addressed to the child
        val simulating: Boolean = false,
        @param:StringRes val errorRes: Int? = null,
    ) : PaymentSheet {
        val simulateAvailable: Boolean get() = payment.provider == PaymentProviders.SIMULATED
    }

    data class Boleto(
        val payment: Payment,
        val charge: Charge,
        val simulating: Boolean = false,
        @param:StringRes val errorRes: Int? = null,
    ) : PaymentSheet {
        val simulateAvailable: Boolean get() = payment.provider == PaymentProviders.SIMULATED
    }

    data class Card(
        val charge: Charge,
        val form: CardFormState = CardFormState(),
        val submitting: Boolean = false,
        @param:StringRes val errorRes: Int? = null,
    ) : PaymentSheet

    data class Receipt(val state: ReceiptSheetState) : PaymentSheet

    /** Success pop after settle — `mandateCreated` adds the recorrência line. */
    data class Success(
        val periodStart: String? = null,
        val mandateCreated: Boolean = false,
    ) : PaymentSheet
}
