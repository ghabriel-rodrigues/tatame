package br.com.tatame.core.theme

import br.com.tatame.core.auth.LogoutReason
import br.com.tatame.core.auth.SessionState
import br.com.tatame.core.designsystem.palette.BrandInput
import br.com.tatame.core.network.dto.BrandTheme
import br.com.tatame.core.network.dto.MeAcademy
import br.com.tatame.core.network.dto.MeImpersonation
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.core.network.dto.MeUser
import br.com.tatame.core.network.dto.MembershipView
import br.com.tatame.testutil.InMemoryThemeStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CFG.14/15 — theme state over the session flow (JVM): last-brand cache
 * hydration, brand propagation on login/switch/logout, and the persisted
 * dark preference.
 */
class ThemeControllerTest {

    // ---- fixtures -------------------------------------------------------

    private val navyTheme = BrandTheme(deep = "#14213D", vibrant = "#3A5FA8", accent = "#E63946")
    private val verdeTheme = BrandTheme(deep = "#1B4332", vibrant = "#2D6A4F", accent = "#E8A33D")
    private val navy = BrandInput(deep = "#14213D", vibrant = "#3A5FA8", accent = "#E63946")
    private val verde = BrandInput(deep = "#1B4332", vibrant = "#2D6A4F", accent = "#E8A33D")

    private fun me(theme: BrandTheme?, tenant: String = "t1") = MeResponse(
        user = MeUser("u1", "aluno@tatame.dev", "Aluno Dev", null, null, "pt-BR"),
        memberships = listOf(
            MembershipView(
                id = "m1",
                type = "academy",
                role = "student",
                tenantId = tenant,
                academyName = "Alliance",
                academySlug = "alliance",
                academyStatus = "active",
                status = "active",
            ),
        ),
        activeMembershipId = "m1",
        activeRole = "student",
        academy = MeAcademy(tenant, "Alliance", "alliance", "active", null, theme),
        permissions = emptyMap(),
        impersonation = MeImpersonation(isImpersonated = false),
    )

    private fun platformMe() = me(theme = null).copy(academy = null, activeRole = "owner")

    /**
     * runTest wrapper providing the controller a cancellable scope on the
     * test scheduler (the controller owns infinite collectors, so it cannot
     * live on the test body's own job).
     */
    private fun runControllerTest(
        block: suspend TestScope.(controllerScope: CoroutineScope) -> Unit,
    ) = runTest {
        val controllerScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())
        try {
            block(controllerScope)
        } finally {
            controllerScope.cancel()
        }
    }

    // ---- brand: cold start (CFG.14) -------------------------------------

    @Test
    fun `hydrates the cached brand before any session lands`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore(brand = navy)
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        advanceUntilIdle()
        assertEquals("cold start must paint the last academy brand", navy, controller.state.value.brand)
    }

    @Test
    fun `no cache means default Tatame brand on cold start`() = runControllerTest { controllerScope ->
        val controller = ThemeController(
            MutableStateFlow<SessionState>(SessionState.Booting),
            InMemoryThemeStore(),
            controllerScope,
        )
        advanceUntilIdle()
        assertNull(controller.state.value.brand)
    }

    // ---- brand: session propagation (CFG.14) ----------------------------

    @Test
    fun `login with a branded academy applies and caches the brand`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore()
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.Authenticated(me(navyTheme))
        advanceUntilIdle()

        assertEquals(navy, controller.state.value.brand)
        assertEquals("brand must be cached for the next cold start", navy, store.brand)
    }

    @Test
    fun `unbranded academy renders the default and clears a stale cache`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore(brand = navy)
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.Authenticated(me(theme = null))
        advanceUntilIdle()

        assertNull("null theme = default brand (story 25)", controller.state.value.brand)
        assertNull(store.brand)
    }

    @Test
    fun `membership switch to another academy swaps the brand and the cache`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore()
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.Authenticated(me(navyTheme, tenant = "t1"))
        advanceUntilIdle()
        session.value = SessionState.Authenticated(me(verdeTheme, tenant = "t2"))
        advanceUntilIdle()

        assertEquals("brands must never bleed across tenants", verde, controller.state.value.brand)
        assertEquals(verde, store.brand)
    }

    @Test
    fun `platform session (no academy) stays on the default brand`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore(brand = navy)
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.Authenticated(platformMe())
        advanceUntilIdle()

        assertNull("plataforma is never white-labeled", controller.state.value.brand)
        assertNull(store.brand)
    }

    @Test
    fun `user logout reverts to the default brand and clears the cache`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore()
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.Authenticated(me(navyTheme))
        advanceUntilIdle()
        session.value = SessionState.LoggedOut(LogoutReason.USER_LOGOUT)
        advanceUntilIdle()

        assertNull(controller.state.value.brand)
        assertNull(store.brand)
    }

    @Test
    fun `expired session also clears brand and cache`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore(brand = navy)
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.LoggedOut(LogoutReason.SESSION_EXPIRED)
        advanceUntilIdle()

        assertNull(controller.state.value.brand)
        assertNull(store.brand)
    }

    @Test
    fun `offline landing keeps the cached brand (session kept, retry later)`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore(brand = navy)
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)

        session.value = SessionState.LoggedOut(LogoutReason.OFFLINE)
        advanceUntilIdle()

        assertEquals(navy, controller.state.value.brand)
        assertEquals(navy, store.brand)
    }

    // ---- dark preference (CFG.15) ---------------------------------------

    @Test
    fun `dark defaults to light, not the system scheme`() = runControllerTest { controllerScope ->
        val controller = ThemeController(
            MutableStateFlow<SessionState>(SessionState.Booting),
            InMemoryThemeStore(),
            controllerScope,
        )
        advanceUntilIdle()
        assertFalse(controller.state.value.darkTheme)
    }

    @Test
    fun `persisted dark preference hydrates on launch`() = runControllerTest { controllerScope ->
        val controller = ThemeController(
            MutableStateFlow<SessionState>(SessionState.Booting),
            InMemoryThemeStore(initialDarkTheme = true),
            controllerScope,
        )
        advanceUntilIdle()
        assertTrue(controller.state.value.darkTheme)
    }

    @Test
    fun `setDarkTheme flips the state and persists the preference`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore()
        val controller = ThemeController(
            MutableStateFlow<SessionState>(SessionState.Booting),
            store,
            controllerScope,
        )
        advanceUntilIdle()

        controller.setDarkTheme(true)
        assertTrue("switch must flip synchronously", controller.state.value.darkTheme)
        advanceUntilIdle()
        assertTrue("preference must be persisted", store.persistedDarkTheme)

        controller.setDarkTheme(false)
        advanceUntilIdle()
        assertFalse(controller.state.value.darkTheme)
        assertFalse(store.persistedDarkTheme)
    }

    @Test
    fun `dark preference is untouched by brand changes and logout`() = runControllerTest { controllerScope ->
        val store = InMemoryThemeStore()
        val session = MutableStateFlow<SessionState>(SessionState.Booting)
        val controller = ThemeController(session, store, controllerScope)
        advanceUntilIdle()

        controller.setDarkTheme(true)
        session.value = SessionState.Authenticated(me(navyTheme))
        advanceUntilIdle()
        session.value = SessionState.LoggedOut(LogoutReason.USER_LOGOUT)
        advanceUntilIdle()

        assertTrue("dark is a device preference, not a session one", controller.state.value.darkTheme)
        assertNull(controller.state.value.brand)
    }

    // ---- DTO mapper -----------------------------------------------------

    @Test
    fun `BrandTheme maps 1-1 onto the DerivePalette input`() {
        assertEquals(navy, navyTheme.toBrandInput())
    }
}
