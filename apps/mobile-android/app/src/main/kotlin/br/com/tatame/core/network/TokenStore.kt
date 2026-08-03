package br.com.tatame.core.network

/**
 * Refresh-token persistence seam (ticket mobile-android/02): `core/network`
 * depends only on this interface; the DataStore + Android Keystore
 * implementation lives in `core/auth` (ticket 04).
 */
interface TokenStore {
    suspend fun read(): String?
    suspend fun write(refreshToken: String)
    suspend fun clear()
}
