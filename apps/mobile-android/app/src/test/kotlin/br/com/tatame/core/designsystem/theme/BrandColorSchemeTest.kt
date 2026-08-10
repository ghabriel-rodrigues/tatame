package br.com.tatame.core.designsystem.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import br.com.tatame.core.designsystem.palette.BrandInput
import com.tatame.designsystem.tokens.LumiraTokens
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * CFG.14 — brand → Material3 ColorScheme construction, pinned to the same
 * golden fixtures that pin the DerivePalette port (light + dark): every
 * branded slot must carry exactly the fixture hex, neutrals must stay the
 * static Lumira tokens, and a null brand must be the static default scheme.
 */
class BrandColorSchemeTest {

    private val fixtures = Json
        .parseToJsonElement(loadFixtures())
        .jsonObject
        .getValue("fixtures")
        .jsonObject

    private fun loadFixtures(): String =
        checkNotNull(javaClass.classLoader?.getResourceAsStream("palette-fixtures.json")) {
            "palette-fixtures.json missing from test resources"
        }.bufferedReader().use { it.readText() }

    private fun fixtureBrand(preset: String): BrandInput {
        val brand = fixtures.getValue(preset).jsonObject.getValue("brand").jsonObject
        return BrandInput(
            deep = brand.getValue("deep").jsonPrimitive.content,
            vibrant = brand.getValue("vibrant").jsonPrimitive.content,
            accent = brand.getValue("accent").jsonPrimitive.content,
        )
    }

    private fun fixtureColor(preset: String, mode: String, token: String): Color {
        val hex = fixtures.getValue(preset).jsonObject
            .getValue(mode).jsonObject
            .getValue(token).jsonPrimitive.content
        return Color(0xFF000000L or hex.removePrefix("#").toLong(16))
    }

    /** Branded slot ↔ palette token mapping (mirror of brandColorScheme). */
    private fun lightSlots(s: ColorScheme): List<Pair<String, Color>> = listOf(
        "purple-700" to s.primary,
        "purple-100" to s.primaryContainer,
        "purple-900" to s.onPrimaryContainer,
        "purple-500" to s.secondary,
        "purple-50" to s.secondaryContainer,
        "purple-800" to s.onSecondaryContainer,
        "pink-500" to s.tertiary,
        "pink-100" to s.tertiaryContainer,
        "pink-700" to s.onTertiaryContainer,
    )

    private fun darkSlots(s: ColorScheme): List<Pair<String, Color>> = listOf(
        "purple-ink" to s.primary,
        "purple-950" to s.onPrimary,
        "purple-100" to s.primaryContainer,
        "purple-500" to s.secondary,
        "purple-50" to s.secondaryContainer,
        "pink-ink" to s.tertiary,
        "purple-950" to s.onTertiary,
        "pink-100" to s.tertiaryContainer,
    )

    @Test
    fun `branded light scheme carries the golden-fixture colors slot by slot`() {
        var assertions = 0
        for (preset in fixtures.keys) {
            val scheme = brandColorScheme(fixtureBrand(preset), darkTheme = false)
            for ((token, actual) in lightSlots(scheme)) {
                assertEquals("$preset/light/$token", fixtureColor(preset, "light", token), actual)
                assertions++
            }
        }
        assertEquals(4 * 9, assertions) // guard against silently empty fixtures
    }

    @Test
    fun `branded dark scheme carries the golden-fixture colors slot by slot`() {
        var assertions = 0
        for (preset in fixtures.keys) {
            val scheme = brandColorScheme(fixtureBrand(preset), darkTheme = true)
            for ((token, actual) in darkSlots(scheme)) {
                assertEquals("$preset/dark/$token", fixtureColor(preset, "dark", token), actual)
                assertions++
            }
        }
        assertEquals(4 * 8, assertions)
    }

    @Test
    fun `neutrals and semantics stay static under any brand`() {
        for (preset in fixtures.keys) {
            val light = brandColorScheme(fixtureBrand(preset), darkTheme = false)
            assertEquals(LumiraTokens.Colors.BgApp, light.background)
            assertEquals(LumiraTokens.Colors.BgSurface, light.surface)
            assertEquals(LumiraTokens.Colors.Fg1, light.onBackground)
            assertEquals(LumiraTokens.Colors.Danger500, light.error)
            assertEquals(LumiraTokens.Colors.Border2, light.outline)

            val dark = brandColorScheme(fixtureBrand(preset), darkTheme = true)
            assertEquals(LumiraTokens.DarkColors.BgApp, dark.background)
            assertEquals(LumiraTokens.DarkColors.BgSurface, dark.surface)
            assertEquals(LumiraTokens.DarkColors.Fg1, dark.onBackground)
            assertEquals(LumiraTokens.Colors.Danger500, dark.error)
            assertEquals(LumiraTokens.DarkColors.Border2, dark.outline)
        }
    }

    @Test
    fun `null brand is the static default scheme (null indistinguishable from default)`() {
        assertSame(TatameLightColorScheme, brandColorScheme(null, darkTheme = false))
        assertSame(TatameDarkColorScheme, brandColorScheme(null, darkTheme = true))
    }
}
