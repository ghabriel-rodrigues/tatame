package br.com.tatame.feature.notifications

import br.com.tatame.core.network.dto.NotificationCategories
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Pure PT-BR label building for the Notificações surfaces (spec 010,
 * NOT.10/11) — JVM-testable, mirrors the handoff copy (aluno-20,
 * responsavel-09). Row content (title/body/chip) arrives render-ready from
 * the API; only the relative timestamp and the chip icon fallback are
 * composed client-side, same precedent as
 * [br.com.tatame.feature.events.EventFormat].
 */
object NotificationsFormat {

    private val WEEKDAYS_SHORT = listOf("Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb")
    private val MONTHS_SHORT = listOf(
        "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    )

    /**
     * Relative PT-BR timestamp from `createdAt` (prototype vocabulary):
     * "Hoje" / "Ontem" / weekday short within the last week ("Seg") / month
     * abbreviation beyond it ("Jun"). Unparseable input renders empty (the
     * row stays useful without a timestamp).
     */
    fun relativeLabel(
        createdAtIso: String,
        today: LocalDate,
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        val date = parseDate(createdAtIso, zone) ?: return ""
        val daysAgo = ChronoUnit.DAYS.between(date, today)
        return when {
            daysAgo <= 0L -> "Hoje" // clock-skew future rows read as today
            daysAgo == 1L -> "Ontem"
            daysAgo < 7L -> WEEKDAYS_SHORT[date.dayOfWeek.value % 7]
            else -> MONTHS_SHORT[date.monthValue - 1]
        }
    }

    /**
     * Category icon fallback when the API sends no pre-rendered `chip`
     * (closed `notification_category` vocabulary; unknown categories get the
     * neutral dot — a forward-compat server never breaks the row).
     */
    fun chipFallback(category: String): String = when (category) {
        NotificationCategories.PAYMENT -> "R$"
        NotificationCategories.EVENT -> "◷"
        NotificationCategories.GRADUATION -> "★"
        NotificationCategories.ATTENDANCE -> "✓"
        NotificationCategories.STORE -> "⌂"
        else -> "•"
    }

    private fun parseDate(createdAtIso: String, zone: ZoneId): LocalDate? =
        runCatching { Instant.parse(createdAtIso).atZone(zone).toLocalDate() }.getOrNull()
}
