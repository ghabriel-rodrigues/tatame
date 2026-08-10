package br.com.tatame.feature.agenda

import br.com.tatame.core.network.dto.CalendarBuckets
import br.com.tatame.core.network.dto.CalendarClassItem
import br.com.tatame.core.network.dto.CalendarEventItem
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

/**
 * Pure month-grid math + PT-BR titles for the persona calendars (AGD.8,
 * aluno-08 / professor-04). The server returns weekly recurrence buckets;
 * these helpers expand them over the rendered month (spec 007) — Sunday-first
 * columns matching the API weekday convention (0 = Sunday … 6 = Saturday).
 */
object CalendarGrid {

    private val PT_BR = Locale("pt", "BR")

    /** Grid column header letters, Sunday-first (prototype `calSemana`). */
    val WEEK_HEADER = listOf("D", "S", "T", "Q", "Q", "S", "S")

    private val WEEKDAYS =
        listOf("Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado")

    private val MONTHS = listOf(
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    )

    /** API weekday index of a date: 0 = Sunday … 6 = Saturday. */
    fun apiWeekday(date: LocalDate): Int = date.dayOfWeek.value % 7

    /**
     * Grid cells for a month: leading `null`s pad the first week up to the
     * Sunday-first column of day 1, then every day of the month in order.
     * Consumers chunk by 7 into rows (last row may be partial, per design).
     */
    fun cells(month: YearMonth): List<LocalDate?> {
        val leading = apiWeekday(month.atDay(1))
        return List(leading) { null } + (1..month.lengthOfMonth()).map(month::atDay)
    }

    /** "Agosto 2026" (calendar header). */
    fun monthTitle(month: YearMonth): String = "${MONTHS[month.monthValue - 1]} ${month.year}"

    /** "Domingo, 2 de agosto" (selected-day header, prototype `calDiaLabel`). */
    fun dayTitle(date: LocalDate): String =
        "${WEEKDAYS[apiWeekday(date)]}, ${date.dayOfMonth} de " +
            MONTHS[date.monthValue - 1].lowercase(PT_BR)

    /** "YYYY-MM" → [YearMonth]; null when the server echo is unparseable. */
    fun parseMonth(raw: String): YearMonth? = runCatching { YearMonth.parse(raw) }.getOrNull()

    /** Whether a date carries the class dot: its weekday's bucket is non-empty. */
    fun hasClassDot(buckets: CalendarBuckets, date: LocalDate): Boolean =
        buckets[apiWeekday(date)].isNotEmpty()

    /** Every dotted date of a month — the buckets→dots expansion (spec 007). */
    fun classDotDates(buckets: CalendarBuckets, month: YearMonth): List<LocalDate> {
        val weekdays = buckets.nonEmptyWeekdays()
        return (1..month.lengthOfMonth()).map(month::atDay).filter { apiWeekday(it) in weekdays }
    }

    /** Selected-day agenda: the weekday bucket sorted by start time. */
    fun dayItems(buckets: CalendarBuckets, date: LocalDate): List<CalendarClassItem> =
        buckets[apiWeekday(date)].sortedBy { it.startTime }

    // ---- events (EVT.12/13 — spec 008 fills the Phase-7 contract) --------

    /** Whether a date carries the pink event dot: a dated event lands on it. */
    fun hasEventDot(events: List<CalendarEventItem>, date: LocalDate): Boolean =
        events.any { parseDate(it.date) == date }

    /** Selected-day Evento entries, sorted by time (undated drafts never arrive). */
    fun dayEvents(events: List<CalendarEventItem>, date: LocalDate): List<CalendarEventItem> =
        events.filter { parseDate(it.date) == date }.sortedBy { it.time.orEmpty() }

    private fun parseDate(raw: String?): LocalDate? =
        raw?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
}
