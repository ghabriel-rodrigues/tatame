package br.com.tatame.testutil

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.MarkAllReadResponse
import br.com.tatame.core.network.dto.MarkReadResponse
import br.com.tatame.core.network.dto.NotificationCategories
import br.com.tatame.core.network.dto.NotificationItem
import br.com.tatame.core.network.dto.NotificationSettingsResponse
import br.com.tatame.core.network.dto.NotificationsListResponse
import br.com.tatame.core.network.dto.UnreadCountResponse
import br.com.tatame.core.notifications.NotificationsRepository

/**
 * Configurable in-memory [NotificationsRepository] for ViewModel tests
 * (NOT.10/11). `listResults` is a queue so pagination tests can serve the
 * first page and cursor pages distinct payloads; an exhausted queue fails
 * with [ApiError.Network] (a test that under-stocks the queue fails loudly).
 */
class FakeNotificationsRepository : NotificationsRepository {

    val listResults = ArrayDeque<ApiResult<NotificationsListResponse>>()
    var unreadCountResult: ApiResult<UnreadCountResponse> =
        ApiResult.Success(UnreadCountResponse(count = 0))
    var markReadResult: ApiResult<MarkReadResponse> = ApiResult.Failure(ApiError.Network)
    var readAllResult: ApiResult<MarkAllReadResponse> =
        ApiResult.Success(MarkAllReadResponse(updated = 0))
    var settingsResult: ApiResult<NotificationSettingsResponse> =
        ApiResult.Failure(ApiError.Network)
    var updateSettingsResult: ApiResult<NotificationSettingsResponse> =
        ApiResult.Failure(ApiError.Network)

    val listCalls = mutableListOf<String?>()
    var unreadCountCalls = 0
    val markReadCalls = mutableListOf<String>()
    var readAllCalls = 0
    var settingsCalls = 0
    val updateSettingsCalls = mutableListOf<Boolean>()

    override suspend fun list(cursor: String?): ApiResult<NotificationsListResponse> {
        listCalls += cursor
        return listResults.removeFirstOrNull() ?: ApiResult.Failure(ApiError.Network)
    }

    override suspend fun unreadCount(): ApiResult<UnreadCountResponse> {
        unreadCountCalls++
        return unreadCountResult
    }

    override suspend fun markRead(notificationId: String): ApiResult<MarkReadResponse> {
        markReadCalls += notificationId
        return markReadResult
    }

    override suspend fun readAll(): ApiResult<MarkAllReadResponse> {
        readAllCalls++
        return readAllResult
    }

    override suspend fun settings(): ApiResult<NotificationSettingsResponse> {
        settingsCalls++
        return settingsResult
    }

    override suspend fun updateSettings(enabled: Boolean): ApiResult<NotificationSettingsResponse> {
        updateSettingsCalls += enabled
        return updateSettingsResult
    }
}

// ---- fixture builders ----------------------------------------------------

fun notificationItem(
    id: String = "nt1",
    category: String = NotificationCategories.PAYMENT,
    chip: String? = "R$",
    title: String = "Mensalidade de agosto disponível",
    body: String? = "Vence em 15/08 · R$ 260,00",
    route: String? = "wallet",
    readAt: String? = null,
    createdAt: String = "2026-08-10T12:00:00.000Z",
): NotificationItem = NotificationItem(
    id = id,
    category = category,
    chip = chip,
    title = title,
    body = body,
    route = route,
    readAt = readAt,
    createdAt = createdAt,
)

fun notificationsPage(
    vararg notifications: NotificationItem,
    nextCursor: String? = null,
): NotificationsListResponse = NotificationsListResponse(
    notifications = notifications.toList(),
    nextCursor = nextCursor,
)
