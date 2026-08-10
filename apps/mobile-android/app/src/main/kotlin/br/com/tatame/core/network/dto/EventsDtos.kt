// Hand-written mirror of the events surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/** `event_registration_status` enum values (schema/enums stay English per charter). */
object EventRegistrationStatuses {
    const val PENDING_PAYMENT = "pending_payment"
    const val CONFIRMED = "confirmed"
    const val CANCELED = "canceled"
}

/**
 * `EventRegistrationStateDto` — the caller's (or dependent's) own registration
 * row. `chargeId` is the open event-origin charge to pay (pending_payment
 * only) — it drives the Pix sheet retry without re-registering.
 */
@Serializable
data class EventRegistrationState(
    val id: String,
    val status: String, // pending_payment | confirmed | canceled
    val chargeId: String? = null,
)

/** `EventResponsibleDto` — the "Responsável: Prof. …" line. */
@Serializable
data class EventResponsible(
    val userId: String,
    val fullName: String,
)

/**
 * `AlunoEventItemDto` — home "Próximos eventos" / agenda "Eventos do mês"
 * card. `priceCents` null = gratuito; `date`/`time` come tenant-local.
 */
@Serializable
data class AlunoEventItem(
    val id: String,
    val name: String,
    val bannerPreset: String, // design-system gradient slug
    val location: String? = null,
    val startsAt: String? = null, // null only on drafts ("Data a definir")
    val date: String? = null, // "2026-08-22", tenant-local
    val time: String? = null, // "10:00", tenant-local
    val priceCents: Long? = null, // integer cents; null = gratuito
    val registration: EventRegistrationState? = null,
)

/** `AlunoEventDetailResponseDto` — one screen answers everything (aluno-10). */
@Serializable
data class AlunoEventDetailResponse(
    val id: String,
    val name: String,
    val bannerPreset: String,
    val location: String? = null,
    val startsAt: String? = null,
    val date: String? = null,
    val time: String? = null,
    val priceCents: Long? = null,
    val description: String? = null,
    val responsible: EventResponsible,
    val registration: EventRegistrationState? = null,
)

/**
 * `RegisterEventResponseDto` — free events come back `confirmed` with a null
 * `chargeId`; paid events come back `pending_payment` with the event-origin
 * charge to pay through the existing wallet rails (Pix sheet + simulate).
 */
@Serializable
data class RegisterEventResponse(
    val registration: EventRegistrationState,
    val chargeId: String? = null,
)

/** `ResponsavelEventDependentDto` — one chip per dependent (per-child state). */
@Serializable
data class ResponsavelEventDependent(
    val studentId: String,
    val fullName: String,
    val registration: EventRegistrationState? = null,
)

/** `ResponsavelEventDto` — gradient card + per-dependent chips (responsavel-06). */
@Serializable
data class ResponsavelEvent(
    val id: String,
    val name: String,
    val bannerPreset: String,
    val location: String? = null,
    val startsAt: String? = null,
    val date: String? = null,
    val time: String? = null,
    val priceCents: Long? = null,
    val description: String? = null,
    val dependents: List<ResponsavelEventDependent> = emptyList(),
)

/** `ResponsavelEventsResponseDto` — published upcoming, chronological. */
@Serializable
data class ResponsavelEventsResponse(
    val events: List<ResponsavelEvent> = emptyList(),
)

/** `ProfessorUpcomingEventDto` — the dashboard "Eventos futuros" row (read-only). */
@Serializable
data class ProfessorUpcomingEvent(
    val id: String,
    val name: String,
    val bannerPreset: String,
    val location: String? = null,
    val startsAt: String? = null,
    val date: String? = null,
    val time: String? = null,
    val priceCents: Long? = null,
    val confirmedCount: Int = 0, // the "N confirmados" of the dashboard list
)

/**
 * `CalendarEventItemDto` — the requested month's published events as dated
 * items (the pink dots). `registration` present on aluno surfaces only.
 */
@Serializable
data class CalendarEventItem(
    val id: String,
    val name: String,
    val bannerPreset: String,
    val location: String? = null,
    val startsAt: String? = null,
    val date: String? = null,
    val time: String? = null,
    val priceCents: Long? = null,
    val registration: EventRegistrationState? = null,
)
