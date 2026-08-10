package br.com.tatame.core.theme

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import br.com.tatame.core.designsystem.palette.BrandInput
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Device-local theme persistence (spec 011, CFG.14/15):
 * - last-seen academy brand triplet, so a cold start paints branded before
 *   the session refresh lands (null = default Tatame brand);
 * - the explicit "Tema escuro" preference (per-user, client-side — design
 *   system ticket 06; default light, system-follow is recorded debt).
 */
interface ThemeStore {
    /** Emits the persisted dark preference (false when never set). */
    val darkTheme: Flow<Boolean>

    suspend fun readBrand(): BrandInput?

    /** null clears the cache (logout / academy without branding). */
    suspend fun writeBrand(brand: BrandInput?)

    suspend fun writeDarkTheme(enabled: Boolean)
}

/**
 * [ThemeStore] over Preferences DataStore (TokenStore pattern: only DataStore
 * *core* types referenced, so the class is JVM-unit-testable). The triplet is
 * stored as three keys written atomically in one `edit`; a partial triplet
 * (impossible via [writeBrand], conceivable via corruption) reads as null —
 * fail-closed to the default brand.
 */
class DataStoreThemeStore(
    private val dataStore: DataStore<Preferences>,
) : ThemeStore {

    override val darkTheme: Flow<Boolean> =
        dataStore.data.map { it[KEY_DARK_THEME] ?: false }

    override suspend fun readBrand(): BrandInput? {
        val prefs = dataStore.data.first()
        val deep = prefs[KEY_BRAND_DEEP] ?: return null
        val vibrant = prefs[KEY_BRAND_VIBRANT] ?: return null
        val accent = prefs[KEY_BRAND_ACCENT] ?: return null
        return BrandInput(deep = deep, vibrant = vibrant, accent = accent)
    }

    override suspend fun writeBrand(brand: BrandInput?) {
        dataStore.edit { prefs ->
            if (brand == null) {
                prefs.remove(KEY_BRAND_DEEP)
                prefs.remove(KEY_BRAND_VIBRANT)
                prefs.remove(KEY_BRAND_ACCENT)
            } else {
                prefs[KEY_BRAND_DEEP] = brand.deep
                prefs[KEY_BRAND_VIBRANT] = brand.vibrant
                prefs[KEY_BRAND_ACCENT] = brand.accent
            }
        }
    }

    override suspend fun writeDarkTheme(enabled: Boolean) {
        dataStore.edit { it[KEY_DARK_THEME] = enabled }
    }

    private companion object {
        val KEY_BRAND_DEEP = stringPreferencesKey("brand_deep")
        val KEY_BRAND_VIBRANT = stringPreferencesKey("brand_vibrant")
        val KEY_BRAND_ACCENT = stringPreferencesKey("brand_accent")
        val KEY_DARK_THEME = booleanPreferencesKey("dark_theme")
    }
}
