package br.com.tatame.feature.notifications

import br.com.tatame.R
import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.testutil.FakeNotificationsRepository
import br.com.tatame.testutil.MainDispatcherRule
import br.com.tatame.testutil.notificationItem
import br.com.tatame.testutil.notificationsPage
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/**
 * NOT.10/11 — the shared Notificações feed: first page + read-all-once on
 * open (spec 010 story 8), cursor pagination with double-load guards, and
 * failure behavior (PT-BR copy on first load, silent keep-alive on a failed
 * page or read-all).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val repository = FakeNotificationsRepository()

    private fun loaded(vm: NotificationsViewModel) =
        vm.uiState.value as NotificationsListState.Loaded

    // ---- first page + read-all -------------------------------------------

    @Test
    fun `loads the first page and fires read-all exactly once`() = runTest {
        repository.listResults += ApiResult.Success(
            notificationsPage(
                notificationItem(),
                notificationItem(id = "nt2", route = null),
                nextCursor = "cur-2",
            ),
        )
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        assertEquals(listOf(null), repository.listCalls) // no cursor on page one
        assertEquals(listOf("nt1", "nt2"), loaded(vm).notifications.map { it.id })
        assertEquals("cur-2", loaded(vm).nextCursor)
        assertEquals(1, repository.readAllCalls) // opening IS the read receipt
    }

    @Test
    fun `refresh after a successful open never re-fires read-all`() = runTest {
        repository.listResults += ApiResult.Success(notificationsPage(notificationItem()))
        repository.listResults += ApiResult.Success(notificationsPage(notificationItem()))
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertEquals(2, repository.listCalls.size)
        assertEquals(1, repository.readAllCalls) // once per screen open
    }

    @Test
    fun `a failed read-all never disturbs the loaded feed`() = runTest {
        repository.listResults += ApiResult.Success(notificationsPage(notificationItem()))
        repository.readAllResult = ApiResult.Failure(ApiError.Network)
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        assertEquals(listOf("nt1"), loaded(vm).notifications.map { it.id })
    }

    @Test
    fun `first-load failure maps to PT-BR copy and retry refetches`() = runTest {
        val vm = NotificationsViewModel(repository) // empty queue → Network
        advanceUntilIdle()

        val error = vm.uiState.value as NotificationsListState.Error
        assertEquals(R.string.error_network, error.messageRes)
        assertEquals(0, repository.readAllCalls) // nothing was shown → no receipt

        repository.listResults += ApiResult.Success(notificationsPage(notificationItem()))
        vm.refresh()
        advanceUntilIdle()

        assertEquals(listOf("nt1"), loaded(vm).notifications.map { it.id })
        assertEquals(1, repository.readAllCalls) // the retry is the first open
    }

    // ---- pagination ------------------------------------------------------

    @Test
    fun `loadMore appends the cursor page and advances the cursor`() = runTest {
        repository.listResults += ApiResult.Success(
            notificationsPage(notificationItem(), nextCursor = "cur-2"),
        )
        repository.listResults += ApiResult.Success(
            notificationsPage(notificationItem(id = "nt2"), nextCursor = null),
        )
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        vm.loadMore()
        advanceUntilIdle()

        assertEquals(listOf(null, "cur-2"), repository.listCalls)
        assertEquals(listOf("nt1", "nt2"), loaded(vm).notifications.map { it.id })
        assertNull(loaded(vm).nextCursor) // last page reached
        assertFalse(loaded(vm).loadingMore)
    }

    @Test
    fun `loadMore without a next page is a no-op`() = runTest {
        repository.listResults += ApiResult.Success(notificationsPage(notificationItem()))
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        vm.loadMore()
        advanceUntilIdle()

        assertEquals(listOf<String?>(null), repository.listCalls) // page one only
    }

    @Test
    fun `loadMore mid-flight is guarded against double fetches`() = runTest {
        repository.listResults += ApiResult.Success(
            notificationsPage(notificationItem(), nextCursor = "cur-2"),
        )
        repository.listResults += ApiResult.Success(
            notificationsPage(notificationItem(id = "nt2")),
        )
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        vm.loadMore()
        vm.loadMore() // second call while the first page fetch is in flight
        advanceUntilIdle()

        assertEquals(listOf(null, "cur-2"), repository.listCalls) // one cursor fetch
        assertEquals(listOf("nt1", "nt2"), loaded(vm).notifications.map { it.id })
    }

    @Test
    fun `a failed cursor page keeps the list usable and retryable`() = runTest {
        repository.listResults += ApiResult.Success(
            notificationsPage(notificationItem(), nextCursor = "cur-2"),
        )
        val vm = NotificationsViewModel(repository)
        advanceUntilIdle()

        vm.loadMore() // empty queue → Network failure
        advanceUntilIdle()

        assertEquals(listOf("nt1"), loaded(vm).notifications.map { it.id })
        assertEquals("cur-2", loaded(vm).nextCursor) // cursor survives for a retry
        assertFalse(loaded(vm).loadingMore) // guard released — scrolling retries

        repository.listResults += ApiResult.Success(
            notificationsPage(notificationItem(id = "nt2")),
        )
        vm.loadMore()
        advanceUntilIdle()

        assertEquals(listOf("nt1", "nt2"), loaded(vm).notifications.map { it.id })
    }
}
