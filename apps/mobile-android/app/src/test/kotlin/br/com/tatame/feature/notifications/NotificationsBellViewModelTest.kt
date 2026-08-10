package br.com.tatame.feature.notifications

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.UnreadCountResponse
import br.com.tatame.testutil.FakeNotificationsRepository
import br.com.tatame.testutil.MainDispatcherRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * NOT.10/11 — the home-header bell dot: one unread-count fetch on creation,
 * refreshed when the shell returns from the Notificações screen; failures
 * degrade to "no dot" (a badge is never worth an error surface).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsBellViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val repository = FakeNotificationsRepository()

    @Test
    fun `fetches the unread count on creation`() = runTest {
        repository.unreadCountResult = ApiResult.Success(UnreadCountResponse(count = 3))
        val vm = NotificationsBellViewModel(repository)
        advanceUntilIdle()

        assertEquals(1, repository.unreadCountCalls)
        assertEquals(3, vm.unreadCount.value)
    }

    @Test
    fun `refresh refetches after the screen visit killed the dot`() = runTest {
        repository.unreadCountResult = ApiResult.Success(UnreadCountResponse(count = 3))
        val vm = NotificationsBellViewModel(repository)
        advanceUntilIdle()

        // Read-all just ran server-side; the endpoint now reports zero.
        repository.unreadCountResult = ApiResult.Success(UnreadCountResponse(count = 0))
        vm.refresh()
        advanceUntilIdle()

        assertEquals(2, repository.unreadCountCalls)
        assertEquals(0, vm.unreadCount.value)
    }

    @Test
    fun `a failed fetch degrades to no dot`() = runTest {
        repository.unreadCountResult = ApiResult.Success(UnreadCountResponse(count = 5))
        val vm = NotificationsBellViewModel(repository)
        advanceUntilIdle()

        repository.unreadCountResult = ApiResult.Failure(ApiError.Timeout)
        vm.refresh()
        advanceUntilIdle()

        assertEquals(0, vm.unreadCount.value) // never a stale or error badge
    }
}
