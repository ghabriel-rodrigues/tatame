package br.com.tatame.core.di

import br.com.tatame.core.auth.SessionManager
import br.com.tatame.core.theme.DataStoreThemeStore
import br.com.tatame.core.theme.ThemeController
import br.com.tatame.core.theme.ThemeStore
import org.koin.dsl.module

/**
 * Theme slice (spec 011, CFG.14/15): device-local theme persistence over the
 * session DataStore file (brand cache + dark preference survive logout — the
 * store only ever clears its own keys) and the flow-based [ThemeController]
 * single fed by the session state.
 */
val themeModule = module {
    single<ThemeStore> { DataStoreThemeStore(get()) }
    single {
        ThemeController(
            sessionState = get<SessionManager>().state,
            themeStore = get(),
            scope = get(),
        )
    }
}
