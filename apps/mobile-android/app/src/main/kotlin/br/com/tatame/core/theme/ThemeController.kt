package br.com.tatame.core.theme

import br.com.tatame.core.auth.LogoutReason
import br.com.tatame.core.auth.SessionState
import br.com.tatame.core.designsystem.palette.BrandInput
import br.com.tatame.core.network.dto.BrandTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What the Compose root needs to build the theme (CFG.14/15). */
data class ThemeState(
    /** Academy white-label triplet; null = default Tatame brand. */
    val brand: BrandInput? = null,
    /** Explicit per-user dark preference (default light in v1). */
    val darkTheme: Boolean = false,
)

/** Session `academy.theme` DTO → the DerivePalette input. */
fun BrandTheme.toBrandInput(): BrandInput =
    BrandInput(deep = deep, vibrant = vibrant, accent = accent)

/**
 * Owns the app-wide theme state (Koin `single`, flow-based — same conventions
 * as SessionManager).
 *
 * Brand (CFG.14): hydrated from the DataStore last-brand cache first so cold
 * start paints branded behind the splash, then driven by the session — every
 * Authenticated emission (login, membership switch, silent restore) re-reads
 * `me.academy.theme` and refreshes the cache; explicit logout / expired
 * session clears both (login screen wears the default Tatame brand). An
 * OFFLINE landing keeps the cached brand, mirroring the kept refresh token.
 *
 * Dark mode (CFG.15): explicit two-state preference persisted in DataStore
 * (design-system ticket 06 — replaces the old `isSystemInDarkTheme()`
 * default; system-follow is recorded debt). [setDarkTheme] flips the state
 * optimistically and persists; the store flow is also collected so the
 * persisted value always wins (and survives restarts).
 */
class ThemeController(
    sessionState: Flow<SessionState>,
    private val themeStore: ThemeStore,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(ThemeState())
    val state: StateFlow<ThemeState> = _state.asStateFlow()

    init {
        scope.launch {
            // Cache-then-session, sequentially: the cached brand may only be
            // applied before the first session emission is observed.
            _state.update { it.copy(brand = themeStore.readBrand()) }
            sessionState.collect { session ->
                when (session) {
                    is SessionState.Authenticated -> {
                        val brand = session.me.academy?.theme?.toBrandInput()
                        themeStore.writeBrand(brand)
                        _state.update { it.copy(brand = brand) }
                    }
                    is SessionState.LoggedOut -> when (session.reason) {
                        LogoutReason.USER_LOGOUT, LogoutReason.SESSION_EXPIRED -> {
                            themeStore.writeBrand(null)
                            _state.update { it.copy(brand = null) }
                        }
                        // NONE (fresh install) / OFFLINE (session kept):
                        // leave the cached brand in place.
                        LogoutReason.NONE, LogoutReason.OFFLINE -> Unit
                    }
                    SessionState.Booting, is SessionState.ChoosingMembership -> Unit
                }
            }
        }
        scope.launch {
            themeStore.darkTheme.collect { dark ->
                _state.update { it.copy(darkTheme = dark) }
            }
        }
    }

    /** Aluno perfil "Tema escuro" switch entry point (CFG.15). */
    fun setDarkTheme(enabled: Boolean) {
        _state.update { it.copy(darkTheme = enabled) }
        scope.launch { themeStore.writeDarkTheme(enabled) }
    }
}
