package br.com.tatame.core.notifications

import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.NotificationsApi
import br.com.tatame.core.network.ProblemJson
import br.com.tatame.core.network.apiCall
import br.com.tatame.core.network.dto.MarkAllReadResponse
import br.com.tatame.core.network.dto.MarkReadResponse
import br.com.tatame.core.network.dto.NotificationSettingsResponse
import br.com.tatame.core.network.dto.NotificationsListResponse
import br.com.tatame.core.network.dto.UnreadCountResponse
import br.com.tatame.core.network.dto.UpdateNotificationSettingsRequest
import kotlinx.serialization.json.Json

/**
 * Seam the notifications feature ViewModels talk through (fakeable in JVM
 * tests) — same convention as [br.com.tatame.core.store.StoreRepository].
 * One persona-neutral surface shared by all three shells (spec 010, NOT.10/11).
 */
interface NotificationsRepository {
    suspend fun list(cursor: String? = null): ApiResult<NotificationsListResponse>

    suspend fun unreadCount(): ApiResult<UnreadCountResponse>

    suspend fun markRead(notificationId: String): ApiResult<MarkReadResponse>

    suspend fun readAll(): ApiResult<MarkAllReadResponse>

    suspend fun settings(): ApiResult<NotificationSettingsResponse>

    suspend fun updateSettings(enabled: Boolean): ApiResult<NotificationSettingsResponse>
}

class NotificationsRepositoryImpl(
    private val api: NotificationsApi,
    private val json: Json = ProblemJson,
) : NotificationsRepository {

    override suspend fun list(cursor: String?): ApiResult<NotificationsListResponse> =
        apiCall(json) { api.list(cursor) }

    override suspend fun unreadCount(): ApiResult<UnreadCountResponse> =
        apiCall(json) { api.unreadCount() }

    override suspend fun markRead(notificationId: String): ApiResult<MarkReadResponse> =
        apiCall(json) { api.markRead(notificationId) }

    override suspend fun readAll(): ApiResult<MarkAllReadResponse> =
        apiCall(json) { api.readAll() }

    override suspend fun settings(): ApiResult<NotificationSettingsResponse> =
        apiCall(json) { api.settings() }

    override suspend fun updateSettings(enabled: Boolean): ApiResult<NotificationSettingsResponse> =
        apiCall(json) { api.updateSettings(UpdateNotificationSettingsRequest(enabled = enabled)) }
}
