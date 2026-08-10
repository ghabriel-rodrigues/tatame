package br.com.tatame.testutil

import br.com.tatame.core.designsystem.palette.BrandInput
import br.com.tatame.core.theme.ThemeStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/** In-memory [ThemeStore] for JVM tests (mirrors InMemoryTokenStore). */
class InMemoryThemeStore(
    /** Pre-seeded "last session" brand cache for cold-start hydration tests. */
    var brand: BrandInput? = null,
    initialDarkTheme: Boolean = false,
) : ThemeStore {

    private val dark = MutableStateFlow(initialDarkTheme)

    var brandWrites = 0
        private set

    override val darkTheme: Flow<Boolean> = dark

    /** Last persisted dark value (what a relaunch would hydrate). */
    val persistedDarkTheme: Boolean get() = dark.value

    override suspend fun readBrand(): BrandInput? = brand

    override suspend fun writeBrand(brand: BrandInput?) {
        this.brand = brand
        brandWrites++
    }

    override suspend fun writeDarkTheme(enabled: Boolean) {
        dark.value = enabled
    }
}
