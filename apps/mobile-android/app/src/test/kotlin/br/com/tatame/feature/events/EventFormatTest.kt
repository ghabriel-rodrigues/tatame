package br.com.tatame.feature.events

import br.com.tatame.core.network.dto.EventRegistrationStatuses
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * EVT.12/13 — pure PT-BR event formatting + the detail button state machine
 * (spec 008 testing decisions: free/paid × none/pending/confirmed).
 */
class EventFormatTest {

    // ---- valor chips -----------------------------------------------------

    @Test
    fun `valor chip renders Gratuito for null price and compact BRL otherwise`() {
        assertEquals("Gratuito", EventFormat.valorChip(null))
        assertEquals("R$ 60", EventFormat.valorChip(6_000))
        assertEquals("R$ 120,50", EventFormat.valorChip(12_050))
        assertEquals("R$ 1.250", EventFormat.valorChip(125_000))
    }

    // ---- date squares + lines --------------------------------------------

    @Test
    fun `date square splits day number and month abbreviation`() {
        assertEquals("15", EventFormat.dayNumber("2026-08-15"))
        assertEquals("AGO", EventFormat.monthAbbrev("2026-08-15"))
        assertEquals("SET", EventFormat.monthAbbrev("2026-09-13"))
        assertEquals("—", EventFormat.dayNumber(null))
        assertEquals("", EventFormat.monthAbbrev("not-a-date"))
    }

    @Test
    fun `long and short day dates match the prototype copy`() {
        assertEquals("Sábado, 15 de agosto", EventFormat.longDayDate("2026-08-15"))
        assertEquals("Sáb, 15 de agosto", EventFormat.shortDayDate("2026-08-15"))
        assertEquals("Dom, 13 de setembro", EventFormat.shortDayDate("2026-09-13"))
        assertEquals("Data a definir", EventFormat.longDayDate(null))
    }

    @Test
    fun `date time location line joins the non-null parts`() {
        assertEquals(
            "Dom, 13 de setembro · 09:30 · Ginásio Municipal",
            EventFormat.dateTimeLocationLine("2026-09-13", "09:30", "Ginásio Municipal"),
        )
        assertEquals(
            "Sáb, 15 de agosto · 10:00",
            EventFormat.dateTimeLocationLine("2026-08-15", "10:00", null),
        )
        assertEquals("10:00 · Tatame principal", EventFormat.timeLocationLine("10:00", "Tatame principal"))
        assertEquals("Data a definir", EventFormat.timeLocationLine(null, null))
    }

    @Test
    fun `confirmados line renders gratuito or the compact price`() {
        assertEquals("18 confirmados · gratuito", EventFormat.confirmadosLine(18, null))
        assertEquals("3 confirmados · R$ 120", EventFormat.confirmadosLine(3, 12_000))
    }

    @Test
    fun `inscricao subtitle addresses the event and optionally the child`() {
        assertEquals("Inscrição · Festival Kids", EventFormat.inscricaoSubtitle("Festival Kids"))
        assertEquals(
            "Inscrição · Festival Kids · Pedro",
            EventFormat.inscricaoSubtitle("Festival Kids", "Pedro Silveira"),
        )
    }

    // ---- detail CTA state machine (spec 008 stories 12-15) ---------------

    @Test
    fun `free event maps none and canceled to confirm and confirmed to cancel`() {
        assertEquals(EventFormat.DetailCta.CONFIRM, EventFormat.detailCta(null, null))
        assertEquals(
            EventFormat.DetailCta.CONFIRM,
            EventFormat.detailCta(null, EventRegistrationStatuses.CANCELED),
        )
        assertEquals(
            EventFormat.DetailCta.CANCEL,
            EventFormat.detailCta(null, EventRegistrationStatuses.CONFIRMED),
        )
    }

    @Test
    fun `paid event maps none canceled and pending to pay and confirmed to none`() {
        assertEquals(EventFormat.DetailCta.PAY, EventFormat.detailCta(6_000, null))
        assertEquals(
            EventFormat.DetailCta.PAY,
            EventFormat.detailCta(6_000, EventRegistrationStatuses.CANCELED),
        )
        assertEquals(
            "pending retries through the same pay CTA",
            EventFormat.DetailCta.PAY,
            EventFormat.detailCta(6_000, EventRegistrationStatuses.PENDING_PAYMENT),
        )
        assertEquals(
            "paid confirmed: admin refund only — no affordance",
            EventFormat.DetailCta.NONE,
            EventFormat.detailCta(6_000, EventRegistrationStatuses.CONFIRMED),
        )
    }

    @Test
    fun `pending cancel affordance shows only on a paid pending registration`() {
        assertTrue(
            EventFormat.showPendingCancel(6_000, EventRegistrationStatuses.PENDING_PAYMENT),
        )
        assertFalse(EventFormat.showPendingCancel(6_000, EventRegistrationStatuses.CONFIRMED))
        assertFalse(EventFormat.showPendingCancel(null, EventRegistrationStatuses.PENDING_PAYMENT))
        assertFalse(EventFormat.showPendingCancel(6_000, null))
    }
}
