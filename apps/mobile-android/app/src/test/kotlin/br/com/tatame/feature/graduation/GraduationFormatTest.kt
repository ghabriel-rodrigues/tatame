package br.com.tatame.feature.graduation

import br.com.tatame.core.network.dto.GraduationKinds
import br.com.tatame.testutil.beltRef
import br.com.tatame.testutil.beltView
import br.com.tatame.testutil.defaultRegua
import br.com.tatame.testutil.validGraduation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** GRD.19/20 — pure PT-BR label building mirroring the handoff copy. */
class GraduationFormatTest {

    // ---- hero & chip labels ----------------------------------------------

    @Test
    fun `hero title matches aluno-09 and drops zero degrees`() {
        assertEquals("Azul · 2 graus", GraduationFormat.heroTitle(beltView(degrees = 2)))
        assertEquals("Azul · 1 grau", GraduationFormat.heroTitle(beltView(degrees = 1)))
        assertEquals("Azul", GraduationFormat.heroTitle(beltView(degrees = 0)))
    }

    @Test
    fun `black belt degrees read as dans per professor-12`() {
        val black = beltView(
            beltId = "b-black",
            name = "Preta",
            colorSlug = "belt.black",
            tipColorSlug = "belt.red",
            maxDegrees = 6,
            degrees = 2,
        )
        assertEquals("Preta · 2º dan", GraduationFormat.heroTitle(black))
        assertEquals("Faixa preta · 2º dan", GraduationFormat.chipLabel(black))
    }

    @Test
    fun `chip label lowercases the belt name`() {
        assertEquals("Faixa azul · 2 graus", GraduationFormat.chipLabel(beltView(degrees = 2)))
        assertEquals(
            "Faixa branca",
            GraduationFormat.chipLabel(
                beltView(beltId = "b-white", name = "Branca", colorSlug = "belt.white", degrees = 0),
            ),
        )
    }

    // ---- progress --------------------------------------------------------

    @Test
    fun `lessons label and fraction follow the progress payload`() {
        assertEquals("26 de 40 aulas", GraduationFormat.lessonsLabel(26, 40))
        assertEquals(0.65f, GraduationFormat.progressFraction(26, 40), 0.0001f)
        assertEquals(1f, GraduationFormat.progressFraction(45, 40), 0.0001f)
        assertEquals(0f, GraduationFormat.progressFraction(26, 0), 0.0001f)
    }

    // ---- timeline --------------------------------------------------------

    @Test
    fun `timeline titles per kind match aluno-09`() {
        assertEquals(
            "Azul · 2º grau",
            GraduationFormat.timelineTitle(GraduationKinds.DEGREE, beltRef(), 2),
        )
        assertEquals(
            "Faixa azul",
            GraduationFormat.timelineTitle(GraduationKinds.BELT, beltRef(), 0),
        )
        assertEquals(
            "Graduação revogada",
            GraduationFormat.timelineTitle(GraduationKinds.REVOCATION, beltRef(), 0),
        )
    }

    @Test
    fun `dates format as capitalized month of year with a safe fallback`() {
        assertEquals("Maio de 2026", GraduationFormat.monthYear("2026-05-14T18:00:00.000Z"))
        assertEquals("Novembro de 2024", GraduationFormat.monthYear("2024-11-02T12:00:00Z"))
        assertEquals("not-a-date", GraduationFormat.monthYear("not-a-date"))
        assertEquals("12 jul", GraduationFormat.dayMonth("2026-07-12T10:00:00.000Z"))
    }

    // ---- promote target (merged régua) -----------------------------------

    @Test
    fun `next enabled belt follows the régua order`() {
        val next = GraduationFormat.nextEnabledBelt(defaultRegua(), "b-blue")
        assertEquals("b-purple", next?.beltId)
    }

    @Test
    fun `disabled kids belts are skipped as promotion targets`() {
        val regua = defaultRegua().map {
            if (it.ladderKind == "kids") it.copy(enabled = false) else it
        }
        val next = GraduationFormat.nextEnabledBelt(regua, "b-white")
        assertEquals("b-blue", next?.beltId)
    }

    @Test
    fun `terminal or unknown current belt yields no target`() {
        assertNull(GraduationFormat.nextEnabledBelt(defaultRegua(), "b-red"))
        assertNull(GraduationFormat.nextEnabledBelt(defaultRegua(), "b-unknown"))
        assertNull(GraduationFormat.nextEnabledBelt(emptyList(), "b-blue"))
        // Everything after the current belt disabled → no guessing.
        val onlyKidsAfter = listOf(
            validGraduation("b-white", "Branca", "belt.white"),
            validGraduation("b-gray", "Cinza", "belt.gray", ladderKind = "kids", enabled = false),
        )
        assertNull(GraduationFormat.nextEnabledBelt(onlyKidsAfter, "b-white"))
    }

    // ---- certificate unlock (REP.15) -------------------------------------

    @Test
    fun `certificate unlocks exactly on available non-reversed belt promotions`() {
        assertTrue(
            GraduationFormat.certificateUnlocked(
                kind = GraduationKinds.BELT,
                certificateAvailable = true,
                reversed = false,
            ),
        )
        // Degree entries never carry a certificate (story 30).
        assertFalse(
            GraduationFormat.certificateUnlocked(
                kind = GraduationKinds.DEGREE,
                certificateAvailable = true,
                reversed = false,
            ),
        )
        // Server flag off (e.g. initial belt) keeps the button away.
        assertFalse(
            GraduationFormat.certificateUnlocked(
                kind = GraduationKinds.BELT,
                certificateAvailable = false,
                reversed = false,
            ),
        )
        // Reversed awards lose the keepsake.
        assertFalse(
            GraduationFormat.certificateUnlocked(
                kind = GraduationKinds.BELT,
                certificateAvailable = true,
                reversed = true,
            ),
        )
        // Revocation rows are never certificates.
        assertFalse(
            GraduationFormat.certificateUnlocked(
                kind = GraduationKinds.REVOCATION,
                certificateAvailable = true,
                reversed = false,
            ),
        )
    }

    @Test
    fun `fullDate renders the PT-BR long date and survives garbage`() {
        assertEquals("14 de novembro de 2024", GraduationFormat.fullDate("2024-11-14T18:00:00.000Z"))
        assertEquals("2024-11-14", GraduationFormat.fullDate("2024-11-14bogus"))
    }
}
