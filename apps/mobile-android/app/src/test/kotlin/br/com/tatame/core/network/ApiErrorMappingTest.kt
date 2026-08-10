package br.com.tatame.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** problem+json → sealed [ApiError] mapping on stable codes (ticket 02). */
class ApiErrorMappingTest {

    @Test
    fun `invalid credentials code maps to InvalidCredentials`() {
        val error = mapHttpError(
            401,
            """{"type":"about:blank","title":"Unauthorized","status":401,"code":"auth.invalid_credentials"}""",
        )
        assertEquals(ApiError.Auth.InvalidCredentials, error)
    }

    @Test
    fun `token expired and refresh reused map to SessionExpired`() {
        listOf("auth.token_expired", "auth.refresh_reused", "auth.unauthenticated").forEach { code ->
            val error = mapHttpError(401, """{"status":401,"code":"$code"}""")
            assertEquals("code $code", ApiError.Auth.SessionExpired, error)
        }
    }

    @Test
    fun `tenant codes map to session-level tenant errors`() {
        assertEquals(
            ApiError.Tenant.AcademySuspended,
            mapHttpError(403, """{"status":403,"code":"tenant.suspended"}"""),
        )
        assertEquals(
            ApiError.Tenant.ReadOnly,
            mapHttpError(403, """{"status":403,"code":"tenant.read_only"}"""),
        )
    }

    @Test
    fun `forbidden role and permission toggle are distinct`() {
        assertEquals(
            ApiError.Auth.Forbidden,
            mapHttpError(403, """{"status":403,"code":"authz.forbidden_role"}"""),
        )
        assertEquals(
            ApiError.Auth.PermissionDisabled,
            mapHttpError(403, """{"status":403,"code":"authz.permission_disabled"}"""),
        )
    }

    @Test
    fun `validation failure carries field errors`() {
        val error = mapHttpError(
            422,
            """
            {"status":422,"code":"validation.failed",
             "errors":[{"field":"email","messages":["must be an email"]},
                       {"field":"password","messages":["too short","too common"]}]}
            """.trimIndent(),
        )
        assertTrue(error is ApiError.Validation)
        val validation = error as ApiError.Validation
        assertEquals(listOf("must be an email"), validation.fieldErrors["email"])
        assertEquals(2, validation.fieldErrors["password"]?.size)
    }

    @Test
    fun `enrollment codes map to the dedicated errors`() {
        assertEquals(
            ApiError.Enrollment.ClassFull,
            mapHttpError(409, """{"status":409,"code":"class.full"}"""),
        )
        assertEquals(
            "bulk-move capacity shares the class-full surface",
            ApiError.Enrollment.ClassFull,
            mapHttpError(409, """{"status":409,"code":"class.capacity_exceeded"}"""),
        )
        assertEquals(
            ApiError.Enrollment.ClassArchived,
            mapHttpError(409, """{"status":409,"code":"class.archived"}"""),
        )
        assertEquals(
            ApiError.Enrollment.AlreadyEnrolled,
            mapHttpError(409, """{"status":409,"code":"enrollment.already_enrolled"}"""),
        )
    }

    @Test
    fun `attendance codes map to the dedicated errors`() {
        assertEquals(
            ApiError.Attendance.CodeInvalid,
            mapHttpError(422, """{"status":422,"code":"checkin.code_invalid"}"""),
        )
        assertEquals(
            ApiError.Attendance.NotEnrolled,
            mapHttpError(403, """{"status":403,"code":"checkin.not_enrolled"}"""),
        )
        assertEquals(
            ApiError.Attendance.NoSessionToday,
            mapHttpError(422, """{"status":422,"code":"checkin.no_session_today"}"""),
        )
        assertEquals(
            ApiError.Attendance.OutsideWindow,
            mapHttpError(422, """{"status":422,"code":"checkin.outside_window"}"""),
        )
        assertEquals(
            ApiError.Attendance.RevokeWindowClosed,
            mapHttpError(403, """{"status":403,"code":"attendance.revoke_window_closed"}"""),
        )
    }

    @Test
    fun `events codes map to the dedicated errors`() {
        assertEquals(
            ApiError.Events.PublishRequirements,
            mapHttpError(422, """{"status":422,"code":"event.publish_requirements"}"""),
        )
        assertEquals(
            ApiError.Events.NotPublished,
            mapHttpError(409, """{"status":409,"code":"event.not_published"}"""),
        )
        assertEquals(
            ApiError.Events.RegistrationSettled,
            mapHttpError(409, """{"status":409,"code":"event.registration_settled"}"""),
        )
    }

    @Test
    fun `enrollment codes never regress plain conflicts`() {
        assertEquals(
            ApiError.Conflict,
            mapHttpError(409, """{"status":409,"code":"resource.conflict"}"""),
        )
    }

    @Test
    fun `unknown code falls back to status buckets`() {
        assertEquals(
            ApiError.Auth.SessionExpired,
            mapHttpError(401, """{"status":401,"code":"auth.some_future_code"}"""),
        )
        assertEquals(ApiError.Server(503), mapHttpError(503, """{"status":503,"code":"whatever.new"}"""))
        assertEquals(
            ApiError.Unknown(418, "teapot.brewing"),
            mapHttpError(418, """{"status":418,"code":"teapot.brewing"}"""),
        )
    }

    @Test
    fun `malformed body never crashes`() {
        assertEquals(ApiError.Auth.SessionExpired, mapHttpError(401, "not json at all"))
        assertEquals(ApiError.Server(500), mapHttpError(500, null))
        assertEquals(ApiError.NotFound, mapHttpError(404, ""))
    }
}
