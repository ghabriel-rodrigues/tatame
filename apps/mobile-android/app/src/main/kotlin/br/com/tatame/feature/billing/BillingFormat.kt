package br.com.tatame.feature.billing

import br.com.tatame.core.network.dto.PaymentMethods
import br.com.tatame.core.network.dto.Plan
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Pure PT-BR label building for the billing surfaces (BIL.19–21) —
 * JVM-testable, mirrors the handoff copy (aluno-12/13/14/15,
 * responsavel-04/05). Amounts are integer cents everywhere in the API;
 * clients format `R$` in pt-BR (charter rule). Formatting is hand-rolled
 * (no NumberFormat) so tests never trip on locale NBSP variants.
 */
object BillingFormat {

    private val PT_BR = Locale("pt", "BR")
    private val DAY_MONTH_LONG = DateTimeFormatter.ofPattern("d 'de' MMMM", PT_BR)
    private val DAY_MONTH_SHORT = DateTimeFormatter.ofPattern("dd/MM", PT_BR)
    private val MONTH_LONG = DateTimeFormatter.ofPattern("MMMM", PT_BR)

    /** "R$ 180,00" / "R$ 1.250,50" — integer cents in, pt-BR currency out. */
    fun amountBRL(amountCents: Long): String {
        val sign = if (amountCents < 0) "-" else ""
        val abs = if (amountCents < 0) -amountCents else amountCents
        val units = (abs / 100).toString()
            .reversed().chunked(3).joinToString(".").reversed()
        val cents = (abs % 100).toString().padStart(2, '0')
        return "${sign}R$ $units,$cents"
    }

    /** "agosto" from an ISO date ("2026-08-01"); null on absent/unparseable input. */
    fun monthName(isoDate: String?): String? = isoDate?.let {
        runCatching { LocalDate.parse(it).format(MONTH_LONG) }.getOrNull()
    }

    /** "Mensalidade · agosto" (aluno-12 card title); no competência → "Mensalidade". */
    fun mensalidadeTitle(periodStart: String?): String =
        monthName(periodStart)?.let { "Mensalidade · $it" } ?: "Mensalidade"

    /** "Pedro · agosto" (responsavel-04 card/histórico title, first name only). */
    fun dependentTitle(fullName: String, periodStart: String?): String {
        val first = fullName.substringBefore(' ')
        return monthName(periodStart)?.let { "$first · $it" } ?: first
    }

    /** "Mensalidade de agosto · Horizonte BJJ" (sheet subtitle, aluno-13/responsavel-05). */
    fun sheetSubtitle(periodStart: String?, contextName: String?): String {
        val base = monthName(periodStart)?.let { "Mensalidade de $it" } ?: "Mensalidade"
        return contextName?.takeIf { it.isNotBlank() }?.let { "$base · $it" } ?: base
    }

    /** "10 de agosto" from "2026-08-10"; raw fallback keeps money screens honest. */
    fun longDate(isoDate: String): String = runCatching {
        LocalDate.parse(isoDate).format(DAY_MONTH_LONG)
    }.getOrDefault(isoDate)

    /** "Vence em 10 de agosto" (card due line). */
    fun dueLabel(dueDate: String): String = "Vence em ${longDate(dueDate)}"

    /** "08/07" from an ISO instant; null on absent/unparseable input. */
    fun shortDate(isoInstant: String?): String? = isoInstant?.let {
        runCatching { OffsetDateTime.parse(it).format(DAY_MONTH_SHORT) }.getOrNull()
    }

    /** "10/08" from a plain ISO date ("2026-08-10"); raw fallback. */
    fun shortDay(isoDate: String): String = runCatching {
        LocalDate.parse(isoDate).format(DAY_MONTH_SHORT)
    }.getOrDefault(isoDate)

    /** "Pix" / "boleto" / "cartão" (histórico method suffix). */
    fun methodLabel(method: String): String = when (method) {
        PaymentMethods.PIX -> "Pix"
        PaymentMethods.BOLETO -> "boleto"
        PaymentMethods.CARD -> "cartão"
        else -> method
    }

    /**
     * "Pago em 08/07 · Pix" — or the responsavel-04 recurrence variant
     * "Pago em 02/08 via recorrência no cartão" when the settle came from an
     * active card mandate. Date-less settles degrade to "Pago · Pix".
     */
    fun paidLine(paidAt: String?, method: String, viaRecurrence: Boolean = false): String {
        val date = shortDate(paidAt)
        val prefix = if (date != null) "Pago em $date" else "Pago"
        return if (viaRecurrence && method == PaymentMethods.CARD) {
            "$prefix via recorrência no cartão"
        } else {
            "$prefix · ${methodLabel(method)}"
        }
    }

    /** "mensal" / "trimestral" / "semestral" / "anual" from the recurrence enum. */
    fun recurrenceLabel(recurrence: String): String = when (recurrence) {
        "monthly" -> "mensal"
        "quarterly" -> "trimestral"
        "semiannual" -> "semestral"
        "yearly" -> "anual"
        else -> recurrence
    }

    /** "Plano mensal recorrente · R$ 180,00" (Carteira header, aluno-12). */
    fun planHeader(plan: Plan): String =
        "Plano ${recurrenceLabel(plan.recurrence)} recorrente · ${amountBRL(plan.amountCents)}"

    /** "plano Kids mensal" (responsavel-04 due-line suffix). */
    fun planSuffix(plan: Plan): String = "plano ${plan.name} ${recurrenceLabel(plan.recurrence)}"
}
