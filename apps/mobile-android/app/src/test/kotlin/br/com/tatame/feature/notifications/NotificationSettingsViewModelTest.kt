package br.com.tatame.feature.notifications

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.dto.NotificationSettingsResponse
import br.com.tatame.testutil.FakeNotificationsRepository
import br.com.tatame.testutil.MainDispatcherRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * NOT.10/11 — the perfil "Notificações" mute switch (spec 010 story 9): GET
 * on creation, optimistic flip on toggle with revert on failure, and the
 * disabled-null guard rails against toggling before the state is known.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationSettingsViewModelTest {

    @get:Rule
    val dispatcherRule = MainDispatcherRule()

    private val repository = FakeNotificationsRepository()

    private fun enabledViewModel(): NotificationSettingsViewModel {
        repository.settingsResult =
            ApiResult.Success(NotificationSettingsResponse(enabled = true))
        return NotificationSettingsViewModel(repository)
    }

    // ---- initial GET -----------------------------------------------------

    @Test
    fun `loads the switch state on creation`() = runTest {
        val vm = enabledViewModel()
        advanceUntilIdle()

        assertEquals(1, repository.settingsCalls)
        assertEquals(true, vm.uiState.value.enabled)
        assertFalse(vm.uiState.value.saving)
    }

    @Test
    fun `a failed GET keeps the switch disabled-null`() = runTest {
        repository.settingsResult = ApiResult.Failure(ApiError.Network)
        val vm = NotificationSettingsViewModel(repository)
        advanceUntilIdle()

        assertNull(vm.uiState.value.enabled) // no false state, switch disabled
    }

    // ---- toggle ----------------------------------------------------------

    @Test
    fun `toggle puts the flip and lands on the server state`() = runTest {
        val vm = enabledViewModel()
        advanceUntilIdle()

        repository.updateSettingsResult =
            ApiResult.Success(NotificationSettingsResponse(enabled = false))
        vm.toggle(false)

        // Optimistic: the switch flips before the PUT lands, disabled while saving.
        assertEquals(false, vm.uiState.value.enabled)
        assertTrue(vm.uiState.value.saving)

        advanceUntilIdle()

        assertEquals(listOf(false), repository.updateSettingsCalls)
        assertEquals(false, vm.uiState.value.enabled)
        assertFalse(vm.uiState.value.saving)
    }

    @Test
    fun `a failed PUT springs the switch back`() = runTest {
        val vm = enabledViewModel()
        advanceUntilIdle()

        repository.updateSettingsResult = ApiResult.Failure(ApiError.Server(500))
        vm.toggle(false)
        advanceUntilIdle()

        assertEquals(true, vm.uiState.value.enabled) // optimistic revert
        assertFalse(vm.uiState.value.saving)
    }

    // ---- guard rails -----------------------------------------------------

    @Test
    fun `toggle before the GET lands is ignored`() = runTest {
        repository.settingsResult = ApiResult.Failure(ApiError.Network)
        val vm = NotificationSettingsViewModel(repository)
        advanceUntilIdle()

        vm.toggle(false)
        advanceUntilIdle()

        assertTrue(repository.updateSettingsCalls.isEmpty())
        assertNull(vm.uiState.value.enabled)
    }

    @Test
    fun `toggling to the current value is a no-op`() = runTest {
        val vm = enabledViewModel()
        advanceUntilIdle()

        vm.toggle(true) // already enabled
        advanceUntilIdle()

        assertTrue(repository.updateSettingsCalls.isEmpty())
    }

    @Test
    fun `toggle mid-save is guarded against double PUTs`() = runTest {
        val vm = enabledViewModel()
        advanceUntilIdle()

        repository.updateSettingsResult =
            ApiResult.Success(NotificationSettingsResponse(enabled = false))
        vm.toggle(false)
        vm.toggle(true) // while the first PUT is in flight
        advanceUntilIdle()

        assertEquals(listOf(false), repository.updateSettingsCalls)
        assertEquals(false, vm.uiState.value.enabled)
    }
}
