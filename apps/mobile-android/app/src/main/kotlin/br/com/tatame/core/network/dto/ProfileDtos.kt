// Hand-written mirror of the aluno profile surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable

/**
 * `AlunoProfileResponseDto` (spec 013, REP.6/REP.13 — aluno-18). Email and
 * birthDate are read-only identity facts (birth date served from the linked
 * student row); `cpfLocked`/`rgLocked` drive the dashed lock boxes.
 */
@Serializable
data class AlunoProfileResponse(
    val fullName: String,
    val email: String,
    val birthDate: String? = null, // "2000-03-15"
    val phone: String? = null,
    val gender: String? = null, // female | male | other | unspecified
    val cpf: String? = null, // 11 normalized digits — clients render the mask
    val cpfLocked: Boolean,
    val rg: String? = null,
    val rgLocked: Boolean,
    val addressLine: String? = null,
    val addressCity: String? = null,
    val addressState: String? = null, // UF, 2 uppercase letters
    val addressZip: String? = null, // CEP, 8 normalized digits
    val emergencyContactName: String? = null,
    val emergencyContactPhone: String? = null,
    val avatarUrl: String? = null, // avatars stay initials in v1 (Trocar foto placeholder)
)

/** `gender` enum values (schema/enums stay English per charter). */
object ProfileGenders {
    const val FEMALE = "female"
    const val MALE = "male"
    const val OTHER = "other"
    const val UNSPECIFIED = "unspecified"

    val ALL = listOf(FEMALE, MALE, OTHER, UNSPECIFIED)
}
