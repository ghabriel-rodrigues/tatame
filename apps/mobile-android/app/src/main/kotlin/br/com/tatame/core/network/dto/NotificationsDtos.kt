// Hand-written mirror of the notifications surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/** `notification_category` enum values (schema/enums stay English per charter). */
object NotificationCategories {
    const val PAYMENT = "payment"
    const val EVENT = "event"
    const val GRADUATION = "graduation"
    const val ATTENDANCE = "attendance"
    const val STORE = "store"
}

/**
 * `NotificationDto` — one render-ready feed row (spec 010): PT-BR `title`/
 * `body` composed server-side at insert time, `chip` the pre-rendered chip
 * label ("R$", "15", "2º", initials; null = category-icon fallback), `route`
 * a semantic deep-link hint mapped client-side per shell (unknown/null =
 * inert), `createdAt` rendered as the relative PT-BR timestamp.
 */
@Serializable
data class NotificationItem(
    val id: String,
    val category: String, // payment | event | graduation | attendance | store
    val chip: String? = null,
    val title: String,
    val body: String? = null,
    val route: String? = null, // wallet | event/{eventId} | graduation | orders | store
    val readAt: String? = null,
    val createdAt: String,
)

/** `NotificationsListResponseDto` — own rows newest first, cursor-paged (~30). */
@Serializable
data class NotificationsListResponse(
    val notifications: List<NotificationItem>,
    val nextCursor: String? = null, // opaque keyset cursor; null = no further pages
)

/** `UnreadCountResponseDto` — the bell dot source; 0 while the membership is muted. */
@Serializable
data class UnreadCountResponse(
    val count: Int,
)

/** `NotificationSettingsResponseDto` — the perfil "Notificações" switch state. */
@Serializable
data class NotificationSettingsResponse(
    val enabled: Boolean,
)

/** `UpdateNotificationSettingsDto` — flip the per-membership mute switch. */
@Serializable
data class UpdateNotificationSettingsRequest(
    val enabled: Boolean,
)

/** `MarkReadResponseDto` — the row after an idempotent single mark-read. */
@Serializable
data class MarkReadResponse(
    val notification: NotificationItem,
)

/** `MarkAllReadResponseDto` — rows flipped unread → read by this call. */
@Serializable
data class MarkAllReadResponse(
    val updated: Int,
)
