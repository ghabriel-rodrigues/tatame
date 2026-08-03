package br.com.tatame.core.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import br.com.tatame.core.network.TokenStore
import kotlinx.coroutines.flow.first

/**
 * [TokenStore] over Preferences DataStore; the refresh token value is
 * encrypted at rest by [RefreshTokenCipher] (Android Keystore in production,
 * fake in JVM tests). Only DataStore *core* types are referenced so the class
 * is JVM-unit-testable.
 */
class DataStoreTokenStore(
    private val dataStore: DataStore<Preferences>,
    private val cipher: RefreshTokenCipher,
) : TokenStore {

    override suspend fun read(): String? =
        dataStore.data.first()[KEY_REFRESH_TOKEN]?.let(cipher::decrypt)

    override suspend fun write(refreshToken: String) {
        val blob = cipher.encrypt(refreshToken)
        dataStore.edit { it[KEY_REFRESH_TOKEN] = blob }
    }

    override suspend fun clear() {
        dataStore.edit { it.remove(KEY_REFRESH_TOKEN) }
    }

    private companion object {
        val KEY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    }
}
