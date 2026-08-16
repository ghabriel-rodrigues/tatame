package br.com.tatame.feature.graduation

import br.com.tatame.core.designsystem.components.BeltBarLayout
import br.com.tatame.core.designsystem.components.BeltDisplay
import br.com.tatame.core.network.dto.BeltRef
import br.com.tatame.core.network.dto.BeltView
import br.com.tatame.core.network.dto.GraduationKinds
import br.com.tatame.core.network.dto.ValidGraduation
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** DTO → design-system belt payload (components never see network types). */
fun BeltView.toBeltDisplay() = BeltDisplay(
    colorSlug = colorSlug,
    tipColorSlug = tipColorSlug,
    degrees = degrees,
    maxDegrees = maxDegrees,
)

fun BeltRef.toBeltDisplay(degrees: Int = 0) = BeltDisplay(
    colorSlug = colorSlug,
    tipColorSlug = tipColorSlug,
    degrees = degrees,
    maxDegrees = maxDegrees,
)

fun ValidGraduation.toBeltDisplay() = BeltDisplay(
    colorSlug = colorSlug,
    tipColorSlug = tipColorSlug,
    degrees = 0,
    maxDegrees = maxDegrees,
)

/**
 * Pure PT-BR label building for the graduation surfaces (GRD.19/20) —
 * JVM-testable, mirrors the handoff copy (aluno-09, professor-11/12).
 * Belt *names* come from the server (display data); only grammatical
 * scaffolding lives here.
 */
object GraduationFormat {

    private val PT_BR = Locale("pt", "BR")
    private val MONTH_YEAR = DateTimeFormatter.ofPattern("MMMM 'de' yyyy", PT_BR)

    /** Black-belt degrees read as dans everywhere ("2º dan"), per professor-12. */
    private fun isBlack(colorSlug: String): Boolean =
        BeltBarLayout.normalizeSlug(colorSlug) == "black"

    /** "2 graus" / "1 grau" / "2º dan"; null when zero degrees. */
    fun degreesLabel(colorSlug: String, degrees: Int): String? = when {
        degrees <= 0 -> null
        isBlack(colorSlug) -> "${degrees}º dan"
        degrees == 1 -> "1 grau"
        else -> "$degrees graus"
    }

    /** Hero title (aluno-09): "Azul · 2 graus"; degree-less belts show the name only. */
    fun heroTitle(belt: BeltView): String =
        degreesLabel(belt.colorSlug, belt.degrees)?.let { "${belt.name} · $it" } ?: belt.name

    /** Chip label: "Faixa azul · 2 graus" / "Faixa preta · 2º dan" / "Faixa branca". */
    fun chipLabel(belt: BeltView): String {
        val base = "Faixa ${belt.name.lowercase(PT_BR)}"
        return degreesLabel(belt.colorSlug, belt.degrees)?.let { "$base · $it" } ?: base
    }

    /** "26 de 40 aulas" (aluno-09 / professor-11 progress line). */
    fun lessonsLabel(current: Int, target: Int): String = "$current de $target aulas"

    /** Progress-bar fraction, clamped; a zero/invalid target never divides. */
    fun progressFraction(current: Int, target: Int): Float =
        if (target <= 0) 0f else (current.toFloat() / target).coerceIn(0f, 1f)

    /** Timeline entry title: "Azul · 2º grau" / "Faixa azul" / "Graduação revogada". */
    fun timelineTitle(kind: String, belt: BeltRef, degree: Int): String = when (kind) {
        GraduationKinds.DEGREE ->
            if (isBlack(belt.colorSlug)) "${belt.name} · ${degree}º dan"
            else "${belt.name} · ${degree}º grau"
        GraduationKinds.BELT -> "Faixa ${belt.name.lowercase(PT_BR)}"
        else -> "Graduação revogada"
    }

    /** "Maio de 2026" (timeline dates); falls back to the raw date on parse failure. */
    fun monthYear(isoInstant: String): String = runCatching {
        OffsetDateTime.parse(isoInstant).format(MONTH_YEAR).replaceFirstChar { char ->
            char.titlecase(PT_BR)
        }
    }.getOrDefault(isoInstant.take(10))

    /** "12 jul" (note metadata, professor-11); falls back to the raw date. */
    fun dayMonth(isoInstant: String): String = runCatching {
        OffsetDateTime.parse(isoInstant)
            .format(DateTimeFormatter.ofPattern("d MMM", PT_BR))
            .replace(".", "")
    }.getOrDefault(isoInstant.take(10))

    /** "14 de novembro de 2024" (certificate award date); raw date on parse failure. */
    fun fullDate(isoInstant: String): String = runCatching {
        OffsetDateTime.parse(isoInstant)
            .format(DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", PT_BR))
    }.getOrDefault(isoInstant.take(10))

    /**
     * "Ver certificado" unlock rule (REP.15, aluno-09): belt promotions with
     * the server flag, never reversed awards — degree and revocation entries
     * keep no certificate (certificates mean belt promotions, story 30).
     */
    fun certificateUnlocked(kind: String, certificateAvailable: Boolean, reversed: Boolean): Boolean =
        kind == GraduationKinds.BELT && certificateAvailable && !reversed

    /**
     * Default "Promover faixa" target: the first *enabled* belt after the
     * current one in the merged régua order (kids belts toggled off are
     * skipped, story 14). Null when the current belt is unknown or terminal
     * — the action renders disabled, never guesses.
     */
    fun nextEnabledBelt(
        validGraduations: List<ValidGraduation>,
        currentBeltId: String,
    ): ValidGraduation? {
        val currentIndex = validGraduations.indexOfFirst { it.beltId == currentBeltId }
        if (currentIndex < 0) return null
        return validGraduations.drop(currentIndex + 1).firstOrNull { it.enabled }
    }
}
