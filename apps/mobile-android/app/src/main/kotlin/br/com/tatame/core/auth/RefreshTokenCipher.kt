package br.com.tatame.core.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encryption seam for the persisted refresh token (ticket mobile-android/04
 * steer: androidx.security EncryptedSharedPreferences is deprecated — use
 * DataStore with a Keystore-backed AES cipher). Interface so JVM unit tests
 * can use a fake.
 */
interface RefreshTokenCipher {
    /** Plaintext → opaque storable blob. */
    fun encrypt(plaintext: String): String

    /** Blob → plaintext, or null when undecryptable (key rotated/wiped). */
    fun decrypt(blob: String): String?
}

/**
 * AES/GCM under a non-exportable Android Keystore key. Blob layout:
 * base64(iv) + ":" + base64(ciphertext). A lost/rotated key simply yields
 * null → the session layer treats it as "no stored session".
 */
class KeystoreRefreshTokenCipher : RefreshTokenCipher {

    private val keyAlias: String = KEY_ALIAS

    override fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, obtainKey())
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val body = Base64.encodeToString(ciphertext, Base64.NO_WRAP)
        return "$iv:$body"
    }

    override fun decrypt(blob: String): String? = runCatching {
        val (ivPart, bodyPart) = blob.split(':', limit = 2).also { require(it.size == 2) }
        val iv = Base64.decode(ivPart, Base64.NO_WRAP)
        val body = Base64.decode(bodyPart, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, obtainKey(), GCMParameterSpec(TAG_BITS, iv))
        String(cipher.doFinal(body), Charsets.UTF_8)
    }.getOrNull()

    private fun obtainKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "tatame.refresh_token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
    }
}
