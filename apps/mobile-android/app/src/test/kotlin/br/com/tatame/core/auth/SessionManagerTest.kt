package br.com.tatame.core.auth

import br.com.tatame.core.network.ApiError
import br.com.tatame.core.network.ApiResult
import br.com.tatame.core.network.AuthEvent
import br.com.tatame.core.network.AuthEvents
import br.com.tatame.core.network.SessionTokenProvider
import br.com.tatame.core.network.dto.AuthSessionResponse
import br.com.tatame.core.network.dto.MeAcademy
import br.com.tatame.core.network.dto.MeImpersonation
import br.com.tatame.core.network.dto.MeResponse
import br.com.tatame.core.network.dto.MeUser
import br.com.tatame.core.network.dto.MembershipView
import br.com.tatame.core.network.dto.MfaChallengeResponse
import br.com.tatame.core.network.dto.SwitchMembershipResponse
import br.com.tatame.core.network.dto.TokenPairResponse
import br.com.tatame.core.network.dto.UserSummary
import br.com.tatame.testutil.InMemoryTokenStore
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AUTH.22 — session flow state machine over a fake repository (JVM). */
class SessionManagerTest {

    // ---- fixtures -------------------------------------------------------

    private val user = UserSummary(id = "u1", email = "aluno@tatame.dev", fullName = "Aluno Dev")

    private fun membership(id: String, role: String = "student") = MembershipView(
        id = id,
        type = if (role in setOf("owner", "support", "finance")) "platform" else "academy",
        role = role,
        tenantId = "t-$id",
        academyName = "Academia $id",
        academySlug = "academia-$id",
        academyStatus = "active",
        status = "active",
    )

    private fun me(activeMembershipId: String = "m1", role: String = "student") = MeResponse(
        user = MeUser("u1", "aluno@tatame.dev", "Aluno Dev", null, null, "pt-BR"),
        memberships = listOf(membership("m1")),
        activeMembershipId = activeMembershipId,
        activeRole = role,
        academy = MeAcademy("t1", "Alliance", "alliance", "active", null, null),
        permissions = emptyMap(),
        impersonation = MeImpersonation(isImpersonated = false),
    )

    private fun session(memberships: List<MembershipView>, active: String = memberships.first().id) =
        AuthSessionResponse(
            user = user,
            memberships = memberships,
            activeMembershipId = active,
            accessToken = "access-1",
            accessExpiresIn = 900.0,
            refreshToken = "refresh-1",
        )

    private class FakeAuthRepository : AuthRepository {
        var loginResult: ApiResult<LoginOutcome> = ApiResult.Failure(ApiError.Network)
        var refreshResult: ApiResult<TokenPairResponse> = ApiResult.Failure(ApiError.Network)
        var switchResult: ApiResult<SwitchMembershipResponse> = ApiResult.Failure(ApiError.Network)
        var meResult: ApiResult<MeResponse> = ApiResult.Failure(ApiError.Network)
        var logoutResult: ApiResult<Unit> = ApiResult.Success(Unit)
        var switchCalls = 0
        var logoutCalls = 0

        override suspend fun login(email: String, password: String) = loginResult
        override suspend fun refresh(refreshToken: String) = refreshResult
        override suspend fun switchMembership(membershipId: String): ApiResult<SwitchMembershipResponse> {
            switchCalls++
            return switchResult
        }
        override suspend fun me() = meResult
        override suspend fun logout(): ApiResult<Unit> {
            logoutCalls++
            return logoutResult
        }
        override suspend fun logoutAll() = logoutResult
    }

    private class Harness(
        val repository: FakeAuthRepository = FakeAuthRepository(),
        val tokenStore: InMemoryTokenStore = InMemoryTokenStore(),
        val tokenProvider: SessionTokenProvider = SessionTokenProvider(),
        val authEvents: AuthEvents = AuthEvents(),
    )

    private fun kotlinx.coroutines.CoroutineScope.manager(harness: Harness) = SessionManager(
        repository = harness.repository,
        tokenStore = harness.tokenStore,
        tokenProvider = harness.tokenProvider,
        authEvents = harness.authEvents,
        scope = this,
    )

    // ---- cold start -----------------------------------------------------

    @Test
    fun `bootstrap without stored token lands on login`() = runTest {
        val harness = Harness()
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()
        assertEquals(SessionState.LoggedOut(LogoutReason.NONE), manager.state.value)
    }

    @Test
    fun `bootstrap with valid token silently refreshes into the shell`() = runTest {
        val harness = Harness(tokenStore = InMemoryTokenStore("stored-refresh"))
        harness.repository.refreshResult =
            ApiResult.Success(TokenPairResponse("access-2", 900.0, "rotated-refresh"))
        harness.repository.meResult = ApiResult.Success(me())
        val manager = backgroundScope.manager(harness)

        manager.bootstrap()

        assertTrue(manager.state.value is SessionState.Authenticated)
        assertEquals("access-2", harness.tokenProvider.accessToken)
        assertEquals("rotated-refresh", harness.tokenStore.read())
    }

    @Test
    fun `bootstrap with revoked token wipes and reports expired session`() = runTest {
        val harness = Harness(tokenStore = InMemoryTokenStore("revoked-refresh"))
        harness.repository.refreshResult = ApiResult.Failure(ApiError.Auth.SessionExpired)
        val manager = backgroundScope.manager(harness)

        manager.bootstrap()

        assertEquals(SessionState.LoggedOut(LogoutReason.SESSION_EXPIRED), manager.state.value)
        assertNull(harness.tokenStore.read())
        assertNull(harness.tokenProvider.accessToken)
    }

    @Test
    fun `bootstrap offline keeps the stored session and flags offline`() = runTest {
        val harness = Harness(tokenStore = InMemoryTokenStore("kept-refresh"))
        harness.repository.refreshResult = ApiResult.Failure(ApiError.Network)
        val manager = backgroundScope.manager(harness)

        manager.bootstrap()

        assertEquals(SessionState.LoggedOut(LogoutReason.OFFLINE), manager.state.value)
        assertEquals("stored refresh token must survive offline boots", "kept-refresh", harness.tokenStore.read())
    }

    // ---- login ----------------------------------------------------------

    @Test
    fun `login with single membership authenticates directly`() = runTest {
        val harness = Harness()
        harness.repository.loginResult =
            ApiResult.Success(LoginOutcome.Session(session(listOf(membership("m1")))))
        harness.repository.meResult = ApiResult.Success(me())
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()

        val result = manager.login("aluno@tatame.dev", "TatameDev!123")

        assertEquals(LoginResult.Ok, result)
        assertTrue(manager.state.value is SessionState.Authenticated)
        assertEquals("refresh-1", harness.tokenStore.read())
        assertEquals("access-1", harness.tokenProvider.accessToken)
    }

    @Test
    fun `login with multiple memberships requires choosing`() = runTest {
        val harness = Harness()
        val memberships = listOf(membership("m1"), membership("m2", role = "professor"))
        harness.repository.loginResult = ApiResult.Success(LoginOutcome.Session(session(memberships)))
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()

        val result = manager.login("multi@tatame.dev", "TatameDev!123")

        assertEquals(LoginResult.Ok, result)
        val state = manager.state.value
        assertTrue(state is SessionState.ChoosingMembership)
        assertEquals(2, (state as SessionState.ChoosingMembership).memberships.size)
    }

    @Test
    fun `choosing the already-active membership skips the switch call`() = runTest {
        val harness = Harness()
        val memberships = listOf(membership("m1"), membership("m2"))
        harness.repository.loginResult = ApiResult.Success(LoginOutcome.Session(session(memberships, active = "m1")))
        harness.repository.meResult = ApiResult.Success(me())
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()
        manager.login("multi@tatame.dev", "TatameDev!123")

        manager.chooseMembership("m1")

        assertEquals(0, harness.repository.switchCalls)
        assertTrue(manager.state.value is SessionState.Authenticated)
    }

    @Test
    fun `choosing another membership switches server-side then authenticates`() = runTest {
        val harness = Harness()
        val memberships = listOf(membership("m1"), membership("m2", role = "professor"))
        harness.repository.loginResult = ApiResult.Success(LoginOutcome.Session(session(memberships, active = "m1")))
        harness.repository.switchResult = ApiResult.Success(SwitchMembershipResponse("access-switched", 900.0, "m2"))
        harness.repository.meResult = ApiResult.Success(me(activeMembershipId = "m2", role = "professor"))
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()
        manager.login("multi@tatame.dev", "TatameDev!123")

        manager.chooseMembership("m2")

        assertEquals(1, harness.repository.switchCalls)
        assertEquals("access-switched", harness.tokenProvider.accessToken)
        val state = manager.state.value
        assertTrue(state is SessionState.Authenticated)
        assertEquals("professor", (state as SessionState.Authenticated).me.activeRole)
    }

    @Test
    fun `invalid credentials surface as error without state change`() = runTest {
        val harness = Harness()
        harness.repository.loginResult = ApiResult.Failure(ApiError.Auth.InvalidCredentials)
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()

        val result = manager.login("aluno@tatame.dev", "wrong")

        assertEquals(LoginResult.Error(ApiError.Auth.InvalidCredentials), result)
        assertEquals(SessionState.LoggedOut(LogoutReason.NONE), manager.state.value)
    }

    @Test
    fun `platform MFA account is directed to the web console`() = runTest {
        val harness = Harness()
        harness.repository.loginResult =
            ApiResult.Success(LoginOutcome.MfaRequired(MfaChallengeResponse(true, "challenge-1")))
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()

        val result = manager.login("owner@tatame.dev", "TatameDev!123")

        assertEquals(LoginResult.MfaOnWebOnly, result)
        assertTrue(manager.state.value is SessionState.LoggedOut)
    }

    // ---- logout & expiry ------------------------------------------------

    @Test
    fun `logout wipes locally even when the server call fails`() = runTest {
        val harness = Harness()
        harness.repository.loginResult = ApiResult.Success(LoginOutcome.Session(session(listOf(membership("m1")))))
        harness.repository.meResult = ApiResult.Success(me())
        harness.repository.logoutResult = ApiResult.Failure(ApiError.Network)
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()
        manager.login("aluno@tatame.dev", "TatameDev!123")

        manager.logout()

        assertEquals(1, harness.repository.logoutCalls)
        assertEquals(SessionState.LoggedOut(LogoutReason.USER_LOGOUT), manager.state.value)
        assertNull(harness.tokenStore.read())
        assertNull(harness.tokenProvider.accessToken)
    }

    @Test
    fun `session-expired event from the authenticator lands on login with message`() = runTest {
        val harness = Harness()
        harness.repository.loginResult = ApiResult.Success(LoginOutcome.Session(session(listOf(membership("m1")))))
        harness.repository.meResult = ApiResult.Success(me())
        val manager = backgroundScope.manager(harness)
        manager.bootstrap()
        manager.login("aluno@tatame.dev", "TatameDev!123")
        assertTrue(manager.state.value is SessionState.Authenticated)

        // In the real flow the RefreshAuthenticator wipes both tokens before
        // emitting (covered by RefreshAuthenticatorTest); the manager reacts
        // synchronously by flipping state and clearing the memory token.
        harness.authEvents.emit(AuthEvent.SessionExpired)
        advanceUntilIdle()

        assertEquals(SessionState.LoggedOut(LogoutReason.SESSION_EXPIRED), manager.state.value)
        assertNull(harness.tokenProvider.accessToken)
    }
}
