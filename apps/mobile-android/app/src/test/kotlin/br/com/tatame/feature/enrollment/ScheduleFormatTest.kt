package br.com.tatame.feature.enrollment

import br.com.tatame.testutil.slot
import br.com.tatame.testutil.suggestion
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Pure formatting/parsing rules behind the ENR.21–23 labels. */
class ScheduleFormatTest {

    @Test
    fun `daysLabel is Monday-first and distinct`() {
        val schedules = listOf(slot(weekday = 5), slot(weekday = 1), slot(weekday = 3), slot(weekday = 1))
        assertEquals("Seg · Qua · Sex", ScheduleFormat.daysLabel(schedules))
    }

    @Test
    fun `daysLabel places Sunday last`() {
        assertEquals("Sáb · Dom", ScheduleFormat.daysLabel(listOf(slot(weekday = 0), slot(weekday = 6))))
    }

    @Test
    fun `timeRange adds the duration to the start`() {
        assertEquals("19:00 – 20:30", ScheduleFormat.timeRange(slot(startTime = "19:00", durationMinutes = 90)))
        assertEquals("18:00 – 18:40", ScheduleFormat.timeRange(slot(startTime = "18:00", durationMinutes = 40)))
    }

    @Test
    fun `scheduleLine matches the professor card copy`() {
        val schedules = listOf(
            slot(weekday = 1, startTime = "19:00", durationMinutes = 90),
            slot(weekday = 3, startTime = "19:00", durationMinutes = 90),
            slot(weekday = 5, startTime = "19:00", durationMinutes = 90),
        )
        assertEquals("Seg · Qua · Sex 19:00 – 20:30", ScheduleFormat.scheduleLine(schedules))
    }

    @Test
    fun `suggestionLabel matches the responsavel chip copy`() {
        val kids = suggestion().copy(
            schedules = listOf(
                slot(weekday = 2, startTime = "18:00", durationMinutes = 60),
                slot(weekday = 4, startTime = "18:00", durationMinutes = 60),
            ),
        )
        assertEquals("Kids · Ter e Qui 18:00", ScheduleFormat.suggestionLabel(kids))
    }

    @Test
    fun `nextSlotLabel formats weekday and time`() {
        assertEquals("Ter 18:00", ScheduleFormat.nextSlotLabel(slot(weekday = 2, startTime = "18:00")))
        assertNull(ScheduleFormat.nextSlotLabel(null))
    }

    @Test
    fun `parseBrDate accepts only complete valid dates`() {
        assertEquals("2017-06-10", ScheduleFormat.parseBrDate("10/06/2017"))
        assertNull("partial input must not trigger a fetch", ScheduleFormat.parseBrDate("10/06/20"))
        assertNull(ScheduleFormat.parseBrDate("99/99/9999"))
        assertNull(ScheduleFormat.parseBrDate("31/02/2017")) // strict resolver
        assertNull(ScheduleFormat.parseBrDate(""))
    }

    @Test
    fun `formatBrDate renders ISO dates for display`() {
        assertEquals("10/06/2017", ScheduleFormat.formatBrDate("2017-06-10"))
        assertEquals("not-a-date", ScheduleFormat.formatBrDate("not-a-date"))
    }

    @Test
    fun `ageYears computes whole years against a fixed today`() {
        val today = LocalDate.of(2026, 8, 3)
        assertEquals(9, ScheduleFormat.ageYears("2017-06-10", today))
        assertEquals(8, ScheduleFormat.ageYears("2017-08-04", today)) // birthday tomorrow
        assertNull(ScheduleFormat.ageYears("garbage", today))
    }

    @Test
    fun `initials take first and last names`() {
        assertEquals("PS", ScheduleFormat.initials("Pedro Silveira"))
        assertEquals("LJ", ScheduleFormat.initials("Lucas de Almeida Junior"))
        assertEquals("BI", ScheduleFormat.initials("bia"))
        assertEquals("", ScheduleFormat.initials("   "))
    }
}
