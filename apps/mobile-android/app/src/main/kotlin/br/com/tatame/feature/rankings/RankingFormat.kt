package br.com.tatame.feature.rankings

import br.com.tatame.core.network.dto.RankingBys
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Pure PT-BR label building + bar math for the ranking surfaces (REP.14,
 * aluno-06/07 · professor-05/06) — JVM-testable, no Compose runtime.
 */
object RankingFormat {

    private val PT_BR = Locale("pt", "BR")
    private val MONTH = DateTimeFormatter.ofPattern("MMMM", PT_BR)

    /** Window label "2026-08" → "Agosto" (capitalized); raw label on parse failure. */
    fun monthName(windowLabel: String): String = runCatching {
        YearMonth.parse(windowLabel).format(MONTH).replaceFirstChar { it.titlecase(PT_BR) }
    }.getOrDefault(windowLabel)

    /** Trailing count: "17 aulas" / "1 aula" / "4 eventos" / "1 evento". */
    fun countLabel(by: String, count: Int): String {
        val noun = when (by) {
            RankingBys.EVENTS -> if (count == 1) "evento" else "eventos"
            else -> if (count == 1) "aula" else "aulas"
        }
        return "$count $noun"
    }

    /**
     * Gradient bar width as a fraction of the leader's count (client-derived
     * per the spec); a zero/invalid leader never divides.
     */
    fun barFraction(count: Int, leaderCount: Int): Float =
        if (leaderCount <= 0) 0f else (count.toFloat() / leaderCount).coerceIn(0f, 1f)
}
