package br.com.tatame.feature.enrollment

import br.com.tatame.core.network.dto.ClassSuggestion
import br.com.tatame.core.network.dto.ScheduleSlotView
import java.time.LocalDate
import java.time.LocalTime
import java.time.Period
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle

/**
 * Pure formatting/parsing helpers for the enrollment screens (ENR.21–23).
 * PT-BR weekday abbreviations are UI copy kept as data here because they are
 * indexed by the API's numeric weekday (0 = Sunday … 6 = Saturday).
 */
object ScheduleFormat {

    private val WEEKDAY_ABBREV = listOf("Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb")

    private val TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm")

    private val BR_DATE_FORMAT =
        DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT)

    fun weekdayAbbrev(weekday: Int): String = WEEKDAY_ABBREV.getOrElse(weekday) { "?" }

    /** Distinct weekdays Monday-first, e.g. "Seg · Qua · Sex". */
    fun daysLabel(schedules: List<ScheduleSlotView>, separator: String = " · "): String =
        schedules.map { it.weekday }
            .distinct()
            .sortedBy { (it + 6) % 7 } // Monday-first ordering
            .joinToString(separator) { weekdayAbbrev(it) }

    /** "19:00 – 20:30" from a slot's start time + duration. */
    fun timeRange(slot: ScheduleSlotView): String {
        val start = runCatching { LocalTime.parse(slot.startTime, TIME_FORMAT) }.getOrNull()
            ?: return slot.startTime
        val end = start.plusMinutes(slot.durationMinutes.toLong())
        return "${start.format(TIME_FORMAT)} – ${end.format(TIME_FORMAT)}"
    }

    /** Card schedule line, e.g. "Seg · Qua · Sex 19:00 – 20:30". */
    fun scheduleLine(schedules: List<ScheduleSlotView>): String {
        val first = schedules.firstOrNull() ?: return ""
        return "${daysLabel(schedules)} ${timeRange(first)}"
    }

    /** Suggestion chip label, e.g. "Kids · Ter e Qui 18:00" (responsavel-08). */
    fun suggestionLabel(suggestion: ClassSuggestion): String {
        val days = daysLabel(suggestion.schedules, separator = " e ")
        val time = suggestion.schedules.firstOrNull()?.startTime.orEmpty()
        return listOf(suggestion.name, "$days $time".trim())
            .filter { it.isNotBlank() }
            .joinToString(" · ")
    }

    /** Next-slot label, e.g. "Ter 18:00" (responsavel-02 card). */
    fun nextSlotLabel(slot: ScheduleSlotView?): String? =
        slot?.let { "${weekdayAbbrev(it.weekday)} ${it.startTime}" }

    /** Age in whole years from an ISO birth date; null when unparseable. */
    fun ageYears(isoBirthDate: String, today: LocalDate = LocalDate.now()): Int? =
        runCatching { Period.between(LocalDate.parse(isoBirthDate), today).years }.getOrNull()

    /** Strict "dd/MM/yyyy" → ISO "yyyy-MM-dd"; null when incomplete/invalid. */
    fun parseBrDate(input: String): String? {
        if (input.length != 10) return null
        return runCatching { LocalDate.parse(input, BR_DATE_FORMAT).toString() }.getOrNull()
    }

    /** ISO "yyyy-MM-dd" → "dd/MM/yyyy" for display; input returned when unparseable. */
    fun formatBrDate(isoDate: String): String =
        runCatching { LocalDate.parse(isoDate).format(BR_DATE_FORMAT) }.getOrDefault(isoDate)

    /** Uppercase initials for avatar bubbles, e.g. "Pedro Silveira" → "PS". */
    fun initials(fullName: String): String =
        fullName.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
            .let { parts ->
                when {
                    parts.isEmpty() -> ""
                    parts.size == 1 -> parts.first().take(2)
                    else -> "${parts.first().first()}${parts.last().first()}"
                }
            }.uppercase()
}
