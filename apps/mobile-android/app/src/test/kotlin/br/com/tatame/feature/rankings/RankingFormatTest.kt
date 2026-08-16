package br.com.tatame.feature.rankings

import br.com.tatame.core.network.dto.RankingBys
import org.junit.Assert.assertEquals
import org.junit.Test

/** REP.14 — pure label/bar rules of the ranking surfaces. */
class RankingFormatTest {

    @Test
    fun `monthName renders the capitalized PT-BR month from the window label`() {
        assertEquals("Agosto", RankingFormat.monthName("2026-08"))
        assertEquals("Julho", RankingFormat.monthName("2026-07"))
        // Semester labels are not months — raw fallback, never a crash.
        assertEquals("2026-S2", RankingFormat.monthName("2026-S2"))
    }

    @Test
    fun `countLabel pluralizes aulas and eventos`() {
        assertEquals("17 aulas", RankingFormat.countLabel(RankingBys.LESSONS, 17))
        assertEquals("1 aula", RankingFormat.countLabel(RankingBys.LESSONS, 1))
        assertEquals("4 eventos", RankingFormat.countLabel(RankingBys.EVENTS, 4))
        assertEquals("1 evento", RankingFormat.countLabel(RankingBys.EVENTS, 1))
        assertEquals("0 aulas", RankingFormat.countLabel(RankingBys.LESSONS, 0))
    }

    @Test
    fun `barFraction scales to the leader and clamps`() {
        assertEquals(1f, RankingFormat.barFraction(17, 17))
        assertEquals(0.5f, RankingFormat.barFraction(7, 14))
        assertEquals(0f, RankingFormat.barFraction(0, 17))
        // Degenerate leader counts never divide.
        assertEquals(0f, RankingFormat.barFraction(5, 0))
        // Defensive clamp — a count above the leader (impossible sort) caps at 1.
        assertEquals(1f, RankingFormat.barFraction(20, 17))
    }
}
