package br.com.tatame.feature.agenda

import br.com.tatame.testutil.calendarBuckets
import br.com.tatame.testutil.calendarEventItem
import br.com.tatame.testutil.calendarItem
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * AGD.8 — pure month-grid math over the fixed prototype month (August 2026:
 * day 1 is a Saturday) plus the buckets→dots expansion (spec 007).
 */
class CalendarGridTest {

    private val august = YearMonth.of(2026, 8)

    // ---- grid cells ------------------------------------------------------

    @Test
    fun `august 2026 cells lead with six blanks so day 1 lands on the Saturday column`() {
        val cells = CalendarGrid.cells(august)

        assertEquals(6 + 31, cells.size)
        assertTrue(cells.take(6).all { it == null })
        assertEquals(LocalDate.of(2026, 8, 1), cells[6])
        assertEquals(LocalDate.of(2026, 8, 31), cells.last())
    }

    @Test
    fun `a month starting on Sunday has no leading blanks`() {
        // November 2026 starts on a Sunday.
        val cells = CalendarGrid.cells(YearMonth.of(2026, 11))

        assertEquals(30, cells.size)
        assertEquals(LocalDate.of(2026, 11, 1), cells.first())
    }

    @Test
    fun `api weekday is sunday-first`() {
        assertEquals(0, CalendarGrid.apiWeekday(LocalDate.of(2026, 8, 2))) // Sunday
        assertEquals(1, CalendarGrid.apiWeekday(LocalDate.of(2026, 8, 3))) // Monday
        assertEquals(6, CalendarGrid.apiWeekday(LocalDate.of(2026, 8, 1))) // Saturday
    }

    // ---- PT-BR titles ----------------------------------------------------

    @Test
    fun `month and day titles match the prototype copy`() {
        assertEquals("Agosto 2026", CalendarGrid.monthTitle(august))
        assertEquals("Domingo, 2 de agosto", CalendarGrid.dayTitle(LocalDate.of(2026, 8, 2)))
        assertEquals("Sábado, 1 de agosto", CalendarGrid.dayTitle(LocalDate.of(2026, 8, 1)))
    }

    @Test
    fun `month echo parses and bad echoes fail soft`() {
        assertEquals(august, CalendarGrid.parseMonth("2026-08"))
        assertNull(CalendarGrid.parseMonth("agosto"))
    }

    // ---- buckets → dots expansion ----------------------------------------

    @Test
    fun `dot dates expand weekday buckets over the whole month`() {
        // Mon/Wed/Fri recurrence (the prototype's Fundamentos pattern).
        val buckets = calendarBuckets(
            1 to listOf(calendarItem()),
            3 to listOf(calendarItem()),
            5 to listOf(calendarItem()),
        )

        val dots = CalendarGrid.classDotDates(buckets, august)

        assertEquals(13, dots.size) // Aug/2026: 5 Mondays + 4 Wednesdays + 4 Fridays
        assertTrue(LocalDate.of(2026, 8, 3) in dots) // first Monday
        assertTrue(LocalDate.of(2026, 8, 31) in dots) // last Monday
        assertFalse(LocalDate.of(2026, 8, 2) in dots) // Sunday stays clean
        assertTrue(dots.all { CalendarGrid.hasClassDot(buckets, it) })
        assertFalse(CalendarGrid.hasClassDot(buckets, LocalDate.of(2026, 8, 8))) // Saturday
    }

    @Test
    fun `empty buckets produce no dots`() {
        assertTrue(CalendarGrid.classDotDates(calendarBuckets(), august).isEmpty())
    }

    // ---- event dots + day entries (EVT.12/13, spec 008) ------------------

    @Test
    fun `event dots land on the event date only`() {
        val events = listOf(
            calendarEventItem(id = "ev1", date = "2026-08-15"),
            calendarEventItem(id = "ev2", date = "2026-08-22"),
        )

        assertTrue(CalendarGrid.hasEventDot(events, LocalDate.of(2026, 8, 15)))
        assertTrue(CalendarGrid.hasEventDot(events, LocalDate.of(2026, 8, 22)))
        assertFalse(CalendarGrid.hasEventDot(events, LocalDate.of(2026, 8, 16)))
        assertFalse(CalendarGrid.hasEventDot(emptyList(), LocalDate.of(2026, 8, 15)))
    }

    @Test
    fun `day events filter by date and sort by time`() {
        val events = listOf(
            calendarEventItem(id = "ev2", date = "2026-08-15", time = "14:00"),
            calendarEventItem(id = "ev1", date = "2026-08-15", time = "10:00"),
            calendarEventItem(id = "ev3", date = "2026-08-22", time = "09:00"),
        )

        val day = CalendarGrid.dayEvents(events, LocalDate.of(2026, 8, 15))

        assertEquals(listOf("ev1", "ev2"), day.map { it.id })
        assertTrue(CalendarGrid.dayEvents(events, LocalDate.of(2026, 8, 16)).isEmpty())
    }

    @Test
    fun `undated or malformed event dates never dot the grid`() {
        val events = listOf(calendarEventItem(id = "ev1", date = null))
        assertFalse(CalendarGrid.hasEventDot(events, LocalDate.of(2026, 8, 15)))
        assertTrue(CalendarGrid.dayEvents(events, LocalDate.of(2026, 8, 15)).isEmpty())
    }

    // ---- selected-day agenda ---------------------------------------------

    @Test
    fun `day items come from the date weekday bucket sorted by start time`() {
        val buckets = calendarBuckets(
            1 to listOf(
                calendarItem(classId = "c2", className = "Noite", startTime = "19:00"),
                calendarItem(classId = "c1", className = "Manhã", startTime = "07:00"),
            ),
        )

        val monday = CalendarGrid.dayItems(buckets, LocalDate.of(2026, 8, 3))

        assertEquals(listOf("Manhã", "Noite"), monday.map { it.className })
        assertTrue(CalendarGrid.dayItems(buckets, LocalDate.of(2026, 8, 4)).isEmpty())
    }
}
