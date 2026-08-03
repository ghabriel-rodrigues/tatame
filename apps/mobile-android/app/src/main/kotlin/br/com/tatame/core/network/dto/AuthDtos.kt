// Hand-written mirror of the auth surface of packages/shared/src/api/openapi.json
// (fallback per ticket mobile-android/02 — see app/build.gradle.kts `generateApiClient`).
// Field names MUST stay 1:1 with the spec; regenerate-by-hand on contract changes.

package br.com.tatame.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** `LoginDto` — mobile always requests `transport = "body"`. */
@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val transport: String = "body",
)

/** `UserSummaryDto` */
@Serializable
data class UserSummary(
    val id: String,
    val email: String,
    val fullName: String,
)

/** `MembershipViewDto` */
@Serializable
data class MembershipView(
    val id: String,
    val type: String, // academy | platform
    val role: String, // student | professor | admin | guardian | owner | support | finance
    val tenantId: String?,
    val academyName: String?,
    val academySlug: String?,
    val academyStatus: String?, // trial | active | delinquent | suspended
    val status: String,
)

/** `AuthSessionResponseDto` (200 branch of POST /v1/auth/login). */
@Serializable
data class AuthSessionResponse(
    val user: UserSummary,
    val memberships: List<MembershipView>,
    val activeMembershipId: String,
    val accessToken: String,
    val accessExpiresIn: Double,
    val refreshToken: String? = null, // present for body transport
)

/** `MfaChallengeResponseDto` (202 branch of POST /v1/auth/login). */
@Serializable
data class MfaChallengeResponse(
    val mfaRequired: Boolean,
    val challengeToken: String,
)

/** `RefreshDto` */
@Serializable
data class RefreshRequest(
    val refreshToken: String,
    val transport: String = "body",
)

/** `TokenPairResponseDto` */
@Serializable
data class TokenPairResponse(
    val accessToken: String,
    val accessExpiresIn: Double,
    val refreshToken: String? = null, // present for body transport
)

/** `SwitchMembershipDto` */
@Serializable
data class SwitchMembershipRequest(
    val membershipId: String,
)

/** `SwitchMembershipResponseDto` */
@Serializable
data class SwitchMembershipResponse(
    val accessToken: String,
    val accessExpiresIn: Double,
    val activeMembershipId: String,
)

/** `MeUserDto` */
@Serializable
data class MeUser(
    val id: String,
    val email: String,
    val fullName: String,
    val phone: String?,
    val avatarUrl: String?,
    val locale: String,
)

/**
 * `MeAcademyDto` — `theme` is the raw white-label 3-color brand JSON
 * (`additionalProperties: true` in the spec); kept opaque as [JsonObject]
 * until the white-label slice consumes it via DerivePalette.
 */
@Serializable
data class MeAcademy(
    val id: String,
    val name: String,
    val slug: String,
    val status: String, // trial | active | delinquent | suspended
    val logoUrl: String?,
    val theme: JsonObject?,
)

/** `MeImpersonationDto` */
@Serializable
data class MeImpersonation(
    val isImpersonated: Boolean,
    val impersonatorUserId: String? = null,
)

/** `MeResponseDto` — the session bootstrap payload. */
@Serializable
data class MeResponse(
    val user: MeUser,
    val memberships: List<MembershipView>,
    val activeMembershipId: String?,
    val activeRole: String,
    val academy: MeAcademy?,
    val permissions: Map<String, Boolean>,
    val impersonation: MeImpersonation,
)

/** Academy status values (mirror of the backend `academy_status` enum). */
object AcademyStatus {
    const val TRIAL = "trial"
    const val ACTIVE = "active"
    const val DELINQUENT = "delinquent"
    const val SUSPENDED = "suspended"
}

/** Role values (mirror of the shared role enums; PT-BR labels are UI copy only). */
object Roles {
    const val STUDENT = "student"
    const val PROFESSOR = "professor"
    const val ADMIN = "admin"
    const val GUARDIAN = "guardian"
    const val OWNER = "owner"
    const val SUPPORT = "support"
    const val FINANCE = "finance"
}
