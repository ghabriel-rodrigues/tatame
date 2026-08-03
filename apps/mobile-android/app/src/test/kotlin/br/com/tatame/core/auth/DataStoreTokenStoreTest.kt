package br.com.tatame.core.auth

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Reversible fake cipher — proves the store round-trips through the cipher seam. */
private class FakeCipher : RefreshTokenCipher {
    val encryptCalls = AtomicInteger(0)
    val decryptCalls = AtomicInteger(0)

    override fun encrypt(plaintext: String): String {
        encryptCalls.incrementAndGet()
        return "enc(${plaintext.reversed()})"
    }

    override fun decrypt(blob: String): String? {
        decryptCalls.incrementAndGet()
        if (!blob.startsWith("enc(") || !blob.endsWith(")")) return null
        return blob.removePrefix("enc(").removeSuffix(")").reversed()
    }
}

/** AUTH.22 — TokenStore over DataStore with an at-rest cipher (JVM, fake cipher). */
class DataStoreTokenStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @After
    fun tearDown() {
        scope.cancel()
    }

    private fun newStore(cipher: RefreshTokenCipher): DataStoreTokenStore {
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            File(tmp.root, "session-${System.nanoTime()}.preferences_pb")
        }
        return DataStoreTokenStore(dataStore, cipher)
    }

    @Test
    fun `read returns null when nothing stored`() = runBlocking {
        assertNull(newStore(FakeCipher()).read())
    }

    @Test
    fun `write then read round-trips through the cipher`() = runBlocking {
        val cipher = FakeCipher()
        val store = newStore(cipher)
        store.write("refresh-token-123")
        assertEquals("refresh-token-123", store.read())
        assertTrue("value must be encrypted before persisting", cipher.encryptCalls.get() >= 1)
        assertTrue("value must be decrypted on read", cipher.decryptCalls.get() >= 1)
    }

    @Test
    fun `write overwrites the previous token`() = runBlocking {
        val store = newStore(FakeCipher())
        store.write("first")
        store.write("second")
        assertEquals("second", store.read())
    }

    @Test
    fun `clear wipes the stored token`() = runBlocking {
        val store = newStore(FakeCipher())
        store.write("to-be-wiped")
        store.clear()
        assertNull(store.read())
    }

    @Test
    fun `undecryptable blob reads as no session`() = runBlocking {
        val writeCipher = FakeCipher()
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            File(tmp.root, "shared-${System.nanoTime()}.preferences_pb")
        }
        val writer = DataStoreTokenStore(dataStore, writeCipher)
        writer.write("secret")

        // Same persisted bytes, but a cipher whose key "rotated" (rejects everything).
        val rotated = object : RefreshTokenCipher {
            override fun encrypt(plaintext: String) = plaintext
            override fun decrypt(blob: String): String? = null
        }
        assertNull(DataStoreTokenStore(dataStore, rotated).read())
    }
}
