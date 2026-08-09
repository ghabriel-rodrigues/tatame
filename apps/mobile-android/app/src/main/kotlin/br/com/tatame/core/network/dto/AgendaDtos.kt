// Hand-written mirror of the agenda surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** `AgendaOccupancyDto` — `active` is the "N" of the "N de M vagas" chip. */
@Serializable
data class AgendaOccupancy(
    val active: Int,
    val capacity: Int,
)

/**
 * `AlunoAgendaClassDto` — one schedule slot of an actively enrolled class.
 * `checkedIn` is true iff today's session exists AND the caller holds an
 * active (non-revoked) attendance on it; always false off-today — clients
 * render the button iff `isToday && !checkedIn` (spec 007).
 */
@Serializable
data class AlunoAgendaClass(
    val classId: String,
    val className: String,
    val startTime: String, // "19:00"
    val endTime: String, // slot start + duration, "20:00"
    val professorName: String,
    val ageMin: Int?,
    val ageMax: Int?,
    val minBelt: BeltRef? = null, // both belt ends null = "Todas as faixas"
    val maxBelt: BeltRef? = null,
    val occupancy: AgendaOccupancy,
    val checkedIn: Boolean,
)

/** `AlunoAgendaResponseDto` — `events` ships empty until the events phase (stable contract). */
@Serializable
data class AlunoAgendaResponse(
    val weekday: Int, // 0 = Sunday … 6 = Saturday
    val isToday: Boolean,
    val classes: List<AlunoAgendaClass>, // sorted by start time
    val events: List<JsonObject> = emptyList(),
)

/** `CalendarClassItemDto` */
@Serializable
data class CalendarClassItem(
    val classId: String,
    val className: String,
    val startTime: String,
    val endTime: String,
    val professorName: String,
    val occupancy: AgendaOccupancy,
)

/** `CalendarBucketsDto` — weekly recurrence keyed by weekday (0 = Sunday … 6 = Saturday). */
@Serializable
data class CalendarBuckets(
    @SerialName("0") val sunday: List<CalendarClassItem> = emptyList(),
    @SerialName("1") val monday: List<CalendarClassItem> = emptyList(),
    @SerialName("2") val tuesday: List<CalendarClassItem> = emptyList(),
    @SerialName("3") val wednesday: List<CalendarClassItem> = emptyList(),
    @SerialName("4") val thursday: List<CalendarClassItem> = emptyList(),
    @SerialName("5") val friday: List<CalendarClassItem> = emptyList(),
    @SerialName("6") val saturday: List<CalendarClassItem> = emptyList(),
) {
    /** Bucket by API weekday index; out-of-range reads as an empty day. */
    operator fun get(weekday: Int): List<CalendarClassItem> = when (weekday) {
        0 -> sunday
        1 -> monday
        2 -> tuesday
        3 -> wednesday
        4 -> thursday
        5 -> friday
        6 -> saturday
        else -> emptyList()
    }

    /** API weekdays whose bucket is non-empty — the calendar's class-dot days. */
    fun nonEmptyWeekdays(): Set<Int> = (0..6).filterTo(mutableSetOf()) { this[it].isNotEmpty() }
}

/**
 * `CalendarResponseDto` — the server returns the weekly plan, not per-date
 * dots; the client expands over the rendered month grid (spec 007).
 */
@Serializable
data class CalendarResponse(
    val month: String, // "2026-08", echoed (or current tenant-local) month
    val classesByWeekday: CalendarBuckets,
    val events: List<JsonObject> = emptyList(),
)
