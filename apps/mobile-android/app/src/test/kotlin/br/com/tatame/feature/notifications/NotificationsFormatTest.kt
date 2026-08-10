package br.com.tatame.feature.notifications

import br.com.tatame.core.network.dto.NotificationCategories
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * NOT.10/11 — the pure PT-BR relative-timestamp vocabulary of the aluno-20 /
 * responsavel-09 rows (Hoje/Ontem/weekday/month) and the category icon
 * fallback for chipless rows.
 */
class NotificationsFormatTest {

    // Monday 2026-08-10; UTC keeps the ISO instants and `today` on one clock.
    private val today: LocalDate = LocalDate.of(2026, 8, 10)
    private val zone = ZoneOffset.UTC

    private fun label(iso: String) = NotificationsFormat.relativeLabel(iso, today, zone)

    // ---- relative timestamps ---------------------------------------------

    @Test
    fun `same day renders Hoje`() {
        assertEquals("Hoje", label("2026-08-10T08:30:00.000Z"))
    }

    @Test
    fun `clock-skew future rows clamp to Hoje`() {
        assertEquals("Hoje", label("2026-08-11T00:10:00.000Z"))
    }

    @Test
    fun `one day ago renders Ontem`() {
        assertEquals("Ontem", label("2026-08-09T23:59:00.000Z"))
    }

    @Test
    fun `within the last week renders the short weekday`() {
        assertEquals("Sáb", label("2026-08-08T10:00:00.000Z")) // 2 days ago
        assertEquals("Ter", label("2026-08-04T10:00:00.000Z")) // 6 days ago
    }

    @Test
    fun `seven days or older renders the month abbreviation`() {
        assertEquals("Ago", label("2026-08-03T10:00:00.000Z")) // exactly 7 days
        assertEquals("Jun", label("2026-06-14T10:00:00.000Z"))
        assertEquals("Dez", label("2025-12-25T10:00:00.000Z"))
    }

    @Test
    fun `unparseable createdAt renders empty`() {
        assertEquals("", label("not-a-timestamp"))
        assertEquals("", label("2026-08-10")) // date-only is not an instant
    }

    // ---- chip fallback ---------------------------------------------------

    @Test
    fun `every category maps to its icon fallback`() {
        assertEquals("R$", NotificationsFormat.chipFallback(NotificationCategories.PAYMENT))
        assertEquals("◷", NotificationsFormat.chipFallback(NotificationCategories.EVENT))
        assertEquals("★", NotificationsFormat.chipFallback(NotificationCategories.GRADUATION))
        assertEquals("✓", NotificationsFormat.chipFallback(NotificationCategories.ATTENDANCE))
        assertEquals("⌂", NotificationsFormat.chipFallback(NotificationCategories.STORE))
    }

    @Test
    fun `unknown categories fall back to the neutral dot`() {
        assertEquals("•", NotificationsFormat.chipFallback("mystery-future-category"))
    }
}
