package br.com.tatame.feature.agenda

/**
 * Pure label/affordance helpers for the agenda surfaces (AGD.7/8) —
 * JVM-testable, mirrors the handoff copy (aluno-11). PT-BR scaffolding is
 * data here because it composes with server-sent display data (belt names),
 * same precedent as [br.com.tatame.feature.enrollment.ScheduleFormat].
 */
object AgendaFormat {

    /**
     * Level chip label, composed as the existing turma surfaces do (spec 007):
     * belt range when either belt bound is set, Kids age range otherwise,
     * "Todas as faixas" when the class has no bounds at all.
     */
    fun levelChipLabel(
        ageMin: Int?,
        ageMax: Int?,
        minBeltName: String?,
        maxBeltName: String?,
    ): String = when {
        minBeltName != null && maxBeltName != null ->
            if (minBeltName == maxBeltName) minBeltName else "$minBeltName a $maxBeltName"
        minBeltName != null -> "A partir de $minBeltName"
        maxBeltName != null -> "Até $maxBeltName"
        ageMin != null && ageMax != null -> "$ageMin a $ageMax anos"
        else -> "Todas as faixas"
    }

    /** "10:00 – 11:00" — both ends come pre-derived from the server. */
    fun timeRangeLabel(startTime: String, endTime: String): String = "$startTime – $endTime"

    /**
     * The check-in affordance rule (spec 007 stories 6–9): button iff the
     * shown day is today AND presence is not registered. `checkedIn` renders
     * the green check; any other day renders nothing.
     */
    fun showCheckinButton(isToday: Boolean, checkedIn: Boolean): Boolean = isToday && !checkedIn
}
