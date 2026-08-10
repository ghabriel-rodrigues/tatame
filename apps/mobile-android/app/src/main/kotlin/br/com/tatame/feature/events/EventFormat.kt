package br.com.tatame.feature.events

import br.com.tatame.core.network.dto.EventRegistrationStatuses
import br.com.tatame.feature.billing.BillingFormat
import java.time.LocalDate
import java.util.Locale

/**
 * Pure PT-BR label building + the detail button state machine for the events
 * surfaces (EVT.12/13) — JVM-testable, mirrors the handoff copy (aluno-10,
 * responsavel-06, professor-02). PT-BR scaffolding is data here because it
 * composes with server-sent display data, same precedent as
 * [br.com.tatame.feature.agenda.AgendaFormat] / [BillingFormat].
 */
object EventFormat {

    private val PT_BR = Locale("pt", "BR")

    private val WEEKDAYS_LONG =
        listOf("Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado")
    private val WEEKDAYS_SHORT = listOf("Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb")
    private val MONTHS = listOf(
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    )
    private val MONTHS_ABBREV = listOf(
        "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
        "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
    )

    /**
     * Valor chip: "Gratuito" when `priceCents` is null (charter rule),
     * otherwise compact "R$ 60" / "R$ 120,50" — trailing ",00" drops to match
     * the prototype chips.
     */
    fun valorChip(priceCents: Long?): String =
        priceCents?.let { compactBRL(it) } ?: "Gratuito"

    /** "R$ 120" / "R$ 120,50" — the pay CTA and chips use the compact form. */
    fun compactBRL(amountCents: Long): String =
        BillingFormat.amountBRL(amountCents).removeSuffix(",00")

    /** Date square day number: "15" from "2026-08-15"; "—" for undated. */
    fun dayNumber(isoDate: String?): String =
        parse(isoDate)?.dayOfMonth?.toString() ?: "—"

    /** Date square month: "AGO" from "2026-08-15"; empty for undated. */
    fun monthAbbrev(isoDate: String?): String =
        parse(isoDate)?.let { MONTHS_ABBREV[it.monthValue - 1] } ?: ""

    /** "Sábado, 15 de agosto" (detail info row); "Data a definir" for undated. */
    fun longDayDate(isoDate: String?): String = parse(isoDate)?.let {
        "${WEEKDAYS_LONG[apiWeekday(it)]}, ${it.dayOfMonth} de ${MONTHS[it.monthValue - 1]}"
    } ?: "Data a definir"

    /** "Sáb, 15 de agosto" (card date line); "Data a definir" for undated. */
    fun shortDayDate(isoDate: String?): String = parse(isoDate)?.let {
        "${WEEKDAYS_SHORT[apiWeekday(it)]}, ${it.dayOfMonth} de ${MONTHS[it.monthValue - 1]}"
    } ?: "Data a definir"

    /** "Sáb, 15 de agosto · 10:00 · Tatame principal" — non-null parts joined. */
    fun dateTimeLocationLine(date: String?, time: String?, location: String?): String =
        listOfNotNull(shortDayDate(date), time, location).joinToString(" · ")

    /** "10:00 · Tatame principal" (home card sub-line) — non-null parts joined. */
    fun timeLocationLine(time: String?, location: String?): String =
        listOfNotNull(time, location).joinToString(" · ").ifEmpty { "Data a definir" }

    /** "18 confirmados · gratuito" / "3 confirmados · R$ 120" (professor-02 list). */
    fun confirmadosLine(confirmedCount: Int, priceCents: Long?): String {
        val valor = priceCents?.let { compactBRL(it) } ?: "gratuito"
        return "$confirmedCount confirmados · $valor"
    }

    /**
     * "Inscrição · Festival Kids" — the Pix sheet subtitle for event charges
     * (spec 008 copy); the guardian variant appends the child's name.
     */
    fun inscricaoSubtitle(eventName: String, dependentName: String? = null): String =
        listOfNotNull("Inscrição · $eventName", dependentName?.substringBefore(' '))
            .joinToString(" · ")

    // ---- detail button state machine (aluno-10, spec 008 stories 12–15) ---

    /** What the single detail CTA does for a (price, registration) pair. */
    enum class DetailCta {
        /** "Confirmar presença" — free event, no active registration. */
        CONFIRM,

        /** "Pagar inscrição · R$ X" — paid event, none/canceled/pending registration. */
        PAY,

        /** "Cancelar participação" — free confirmed registration (toggle off). */
        CANCEL,

        /**
         * No button — paid confirmed registration: self-cancel is rejected by
         * the API (`event.registration_settled`); the audited admin refund is
         * the only way back, so no affordance renders (documented UX choice).
         */
        NONE,
    }

    fun detailCta(priceCents: Long?, registrationStatus: String?): DetailCta {
        val confirmed = registrationStatus == EventRegistrationStatuses.CONFIRMED
        return when {
            priceCents == null -> if (confirmed) DetailCta.CANCEL else DetailCta.CONFIRM
            confirmed -> DetailCta.NONE
            else -> DetailCta.PAY
        }
    }

    /**
     * Secondary "Cancelar participação" affordance: only a paid
     * `pending_payment` registration shows it next to the pay-retry CTA
     * (canceling also cancels the open charge, spec story 15).
     */
    fun showPendingCancel(priceCents: Long?, registrationStatus: String?): Boolean =
        priceCents != null && registrationStatus == EventRegistrationStatuses.PENDING_PAYMENT

    // ---- helpers ---------------------------------------------------------

    private fun parse(isoDate: String?): LocalDate? =
        isoDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    private fun apiWeekday(date: LocalDate): Int = date.dayOfWeek.value % 7
}
