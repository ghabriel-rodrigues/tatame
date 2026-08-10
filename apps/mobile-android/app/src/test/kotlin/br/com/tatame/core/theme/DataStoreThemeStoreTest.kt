package br.com.tatame.core.theme

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import br.com.tatame.core.designsystem.palette.BrandInput
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * CFG.14/15 — brand cache + dark preference over DataStore (JVM, real
 * Preferences files; the "new store over the same file" tests are the
 * cold-start/relaunch persistence proof).
 */
class DataStoreThemeStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val navy = BrandInput(deep = "#14213D", vibrant = "#3A5FA8", accent = "#E63946")
    private val verde = BrandInput(deep = "#1B4332", vibrant = "#2D6A4F", accent = "#E8A33D")

    @After
    fun tearDown() {
        scope.cancel()
    }

    private fun newDataStore(name: String = "theme-${System.nanoTime()}"): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) {
            File(tmp.root, "$name.preferences_pb")
        }

    // ---- brand cache (CFG.14) -------------------------------------------

    @Test
    fun `brand reads null when nothing cached`() = runBlocking {
        assertNull(DataStoreThemeStore(newDataStore()).readBrand())
    }

    @Test
    fun `brand write then read round-trips the triplet`() = runBlocking {
        val store = DataStoreThemeStore(newDataStore())
        store.writeBrand(navy)
        assertEquals(navy, store.readBrand())
    }

    @Test
    fun `brand overwrite replaces the previous triplet`() = runBlocking {
        val store = DataStoreThemeStore(newDataStore())
        store.writeBrand(navy)
        store.writeBrand(verde)
        assertEquals(verde, store.readBrand())
    }

    @Test
    fun `null brand clears the cache`() = runBlocking {
        val store = DataStoreThemeStore(newDataStore())
        store.writeBrand(navy)
        store.writeBrand(null)
        assertNull(store.readBrand())
    }

    @Test
    fun `cached brand survives a relaunch (new store over the same file)`() = runBlocking {
        val dataStore = newDataStore("shared-brand")
        DataStoreThemeStore(dataStore).writeBrand(navy)
        assertEquals(navy, DataStoreThemeStore(dataStore).readBrand())
    }

    // ---- dark preference (CFG.15) ---------------------------------------

    @Test
    fun `dark preference defaults to false (explicit two-state, light default)`() = runBlocking {
        assertFalse(DataStoreThemeStore(newDataStore()).darkTheme.first())
    }

    @Test
    fun `dark preference flip persists and flips back`() = runBlocking {
        val store = DataStoreThemeStore(newDataStore())
        store.writeDarkTheme(true)
        assertTrue(store.darkTheme.first())
        store.writeDarkTheme(false)
        assertFalse(store.darkTheme.first())
    }

    @Test
    fun `dark preference survives a relaunch (new store over the same file)`() = runBlocking {
        val dataStore = newDataStore("shared-dark")
        DataStoreThemeStore(dataStore).writeDarkTheme(true)
        assertTrue(DataStoreThemeStore(dataStore).darkTheme.first())
    }

    @Test
    fun `brand cache and dark preference are independent keys`() = runBlocking {
        val store = DataStoreThemeStore(newDataStore())
        store.writeBrand(navy)
        store.writeDarkTheme(true)
        store.writeBrand(null)
        assertTrue("clearing the brand must not touch the dark preference", store.darkTheme.first())
        assertNull(store.readBrand())
    }
}
