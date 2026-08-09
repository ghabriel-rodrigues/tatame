package br.com.tatame.feature.agenda

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGD.7 — level-chip composition + the check-in affordance rule (pure JVM). */
class AgendaFormatTest {

    // ---- level chip ------------------------------------------------------

    @Test
    fun `no bounds at all reads Todas as faixas`() {
        assertEquals(
            "Todas as faixas",
            AgendaFormat.levelChipLabel(ageMin = null, ageMax = null, minBeltName = null, maxBeltName = null),
        )
    }

    @Test
    fun `belt range composes both ends`() {
        assertEquals(
            "Branca a Azul",
            AgendaFormat.levelChipLabel(null, null, minBeltName = "Branca", maxBeltName = "Azul"),
        )
    }

    @Test
    fun `equal belt ends collapse to the single name`() {
        assertEquals(
            "Azul",
            AgendaFormat.levelChipLabel(null, null, minBeltName = "Azul", maxBeltName = "Azul"),
        )
    }

    @Test
    fun `open-ended belt bounds read a partir de and ate`() {
        assertEquals(
            "A partir de Roxa",
            AgendaFormat.levelChipLabel(null, null, minBeltName = "Roxa", maxBeltName = null),
        )
        assertEquals(
            "Até Azul",
            AgendaFormat.levelChipLabel(null, null, minBeltName = null, maxBeltName = "Azul"),
        )
    }

    @Test
    fun `kids age range is used when no belt bounds exist`() {
        assertEquals(
            "6 a 9 anos",
            AgendaFormat.levelChipLabel(ageMin = 6, ageMax = 9, minBeltName = null, maxBeltName = null),
        )
    }

    @Test
    fun `belt bounds win over an age range`() {
        assertEquals(
            "Branca a Azul",
            AgendaFormat.levelChipLabel(ageMin = 6, ageMax = 9, minBeltName = "Branca", maxBeltName = "Azul"),
        )
    }

    // ---- time range + affordance rule ------------------------------------

    @Test
    fun `time range joins the server-derived ends`() {
        assertEquals("10:00 – 11:00", AgendaFormat.timeRangeLabel("10:00", "11:00"))
    }

    @Test
    fun `check-in button shows only on today and not yet checked in`() {
        assertTrue(AgendaFormat.showCheckinButton(isToday = true, checkedIn = false))
        assertFalse(AgendaFormat.showCheckinButton(isToday = true, checkedIn = true))
        assertFalse(AgendaFormat.showCheckinButton(isToday = false, checkedIn = false))
        assertFalse(AgendaFormat.showCheckinButton(isToday = false, checkedIn = true))
    }
}
