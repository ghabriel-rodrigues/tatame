package br.com.tatame.core.network

import br.com.tatame.core.network.dto.MarkAllReadResponse
import br.com.tatame.core.network.dto.MarkReadResponse
import br.com.tatame.core.network.dto.NotificationSettingsResponse
import br.com.tatame.core.network.dto.NotificationsListResponse
import br.com.tatame.core.network.dto.UnreadCountResponse
import br.com.tatame.core.network.dto.UpdateNotificationSettingsRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Hand-written thin Retrofit interface over the persona-neutral notifications
 * surface (spec 010, NOT.5) — same fallback convention as [AuthApi]/[StoreApi]
 * (rationale in app/build.gradle.kts `generateApiClient`). Any authenticated
 * tenant membership reads only its own rows; mark-read and settings carry
 * @BypassReadOnly server-side (a delinquent academy still clears its inbox).
 */
interface NotificationsApi {

    /** Own rows newest first, cursor-paged (~30) — the Notificações feed. */
    @GET("v1/notifications")
    suspend fun list(@Query("cursor") cursor: String? = null): NotificationsListResponse

    /** Bell dot source, refetched on screen focus; 0 while muted. */
    @GET("v1/notifications/unread-count")
    suspend fun unreadCount(): UnreadCountResponse

    /** Idempotent single mark-read (foreign/cross-tenant id → 404). */
    @POST("v1/notifications/{id}/read")
    suspend fun markRead(@Path("id") notificationId: String): MarkReadResponse

    /** Fired on screen open — kills the dot. */
    @POST("v1/notifications/read-all")
    suspend fun readAll(): MarkAllReadResponse

    /** The perfil "Notificações" switch state (active membership). */
    @GET("v1/notifications/settings")
    suspend fun settings(): NotificationSettingsResponse

    /** Flip the per-membership mute (rows keep being written underneath). */
    @PUT("v1/notifications/settings")
    suspend fun updateSettings(
        @Body body: UpdateNotificationSettingsRequest,
    ): NotificationSettingsResponse
}
