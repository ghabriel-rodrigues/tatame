// One typed API error for every repository (ticket 02, decision 5).
// Branching is always on HTTP status + stable problem+json `code`
// (mirror of packages/shared/src/api/errors.ts) — never on human text.

import Foundation

/// Client-side mirror of the API's stable error-code registry.
public enum ApiErrorCode {
    public static let invalidCredentials = "auth.invalid_credentials"
    public static let unauthenticated = "auth.unauthenticated"
    public static let tokenExpired = "auth.token_expired"
    public static let refreshReused = "auth.refresh_reused"
    public static let mfaRequired = "auth.mfa_required"
    public static let mfaInvalidCode = "auth.mfa_invalid_code"
    public static let inviteInvalidOrExpired = "invite.invalid_or_expired"
    public static let inviteMinorRequiresGuardian = "invite.minor_requires_guardian"
    public static let inviteEmailExists = "invite.email_exists"
    public static let inviteAlreadyMember = "invite.already_member"
    public static let resetInvalidOrExpired = "reset.invalid_or_expired"
    public static let forbiddenRole = "authz.forbidden_role"
    public static let permissionDisabled = "authz.permission_disabled"
    public static let impersonationRestricted = "authz.impersonation_restricted"
    public static let tenantSuspended = "tenant.suspended"
    public static let tenantReadOnly = "tenant.read_only"
    public static let classFull = "class.full"
    public static let classArchived = "class.archived"
    public static let classCapacityExceeded = "class.capacity_exceeded"
    public static let alreadyEnrolled = "enrollment.already_enrolled"
    public static let validationFailed = "validation.failed"
    public static let notFound = "resource.not_found"
    public static let conflict = "resource.conflict"
    public static let internalError = "internal.error"
}

/// Field-level validation error (422 payloads).
public struct FieldError: Sendable, Equatable {
    public let field: String
    public let messages: [String]

    public init(field: String, messages: [String]) {
        self.field = field
        self.messages = messages
    }
}

/// The single error type every repository throws.
public enum ApiError: Error, Sendable, Equatable {
    case unauthorized(code: String)
    case forbidden(code: String)
    case validation(fields: [FieldError])
    case notFound(code: String)
    case conflict(code: String)
    case server(status: Int, code: String?)
    case network(URLError.Code)
    case decoding(description: String)
    case unknown(status: Int, code: String?)

    /// The stable code carried by the error, when any.
    public var code: String? {
        switch self {
        case .unauthorized(let code), .forbidden(let code),
             .notFound(let code), .conflict(let code):
            return code
        case .server(_, let code), .unknown(_, let code):
            return code
        case .validation:
            return ApiErrorCode.validationFailed
        case .network, .decoding:
            return nil
        }
    }

    /// True when the session itself is dead (refresh reuse, revoked, expired).
    public var isSessionInvalid: Bool {
        if case .unauthorized = self { return true }
        return false
    }
}
