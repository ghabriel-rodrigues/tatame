package br.com.tatame.core.di

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import br.com.tatame.core.auth.AuthRepository
import br.com.tatame.core.auth.AuthRepositoryImpl
import br.com.tatame.core.auth.DataStoreTokenStore
import br.com.tatame.core.auth.KeystoreRefreshTokenCipher
import br.com.tatame.core.auth.RefreshTokenCipher
import br.com.tatame.core.auth.SessionManager
import br.com.tatame.core.network.TokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module

/**
 * Session slice (ticket mobile-android/04 + 06 conventions): TokenStore over
 * Keystore-encrypted DataStore, app-lifetime coroutine scope, and the
 * flow-based [SessionManager] single (logout resets state, not the graph).
 */
val sessionModule = module {
    single<RefreshTokenCipher> { KeystoreRefreshTokenCipher() }
    single<DataStore<Preferences>> {
        PreferenceDataStoreFactory.create(
            produceFile = { androidContext().preferencesDataStoreFile("tatame_session") },
        )
    }
    single<TokenStore> { DataStoreTokenStore(get(), get()) }
    single<AuthRepository> { AuthRepositoryImpl(get(), get()) }
    single<CoroutineScope> { CoroutineScope(SupervisorJob() + Dispatchers.Default) }
    single {
        SessionManager(
            repository = get(),
            tokenStore = get(),
            tokenProvider = get(),
            authEvents = get(),
            scope = get(),
        )
    }
}
