// Domain models for the auth slice (spec 001-auth). Mapped from the generated
// OpenAPI types inside TatameAPI — features only ever see these (ticket 02).

import Foundation

/// Minimal user identity returned by login/invite-accept.
public struct UserSummary: Sendable, Equatable {
    public let id: UUID
    public let email: String
    public let fullName: String

    public init(id: UUID, email: String, fullName: String) {
        self.id = id
        self.email = email
        self.fullName = fullName
    }
}

/// Academy vs platform membership (spec: one account, N memberships).
public enum MembershipType: String, Sendable {
    case academy
    case platform
}

/// English role names per the shared contract; PT-BR is UI copy only.
public enum MembershipRole: String, Sendable, CaseIterable {
    case student
    case professor
    case admin
    case guardian
    case owner
    case support
    case finance
}

/// Academy (tenant) status — drives suspension blocking and read-only mode.
public enum AcademyStatus: String, Sendable {
    case trial
    case active
    case delinquent
    case suspended
}

/// One membership row from the login/me payloads.
public struct Membership: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let type: MembershipType
    public let role: MembershipRole
    public let tenantId: UUID?
    public let academyName: String?
    public let academyStatus: AcademyStatus?
    public let status: String

    public init(
        id: UUID,
        type: MembershipType,
        role: MembershipRole,
        tenantId: UUID?,
        academyName: String?,
        academyStatus: AcademyStatus?,
        status: String
    ) {
        self.id = id
        self.type = type
        self.role = role
        self.tenantId = tenantId
        self.academyName = academyName
        self.academyStatus = academyStatus
        self.status = status
    }
}

/// Full login result: identity + memberships + the token pair.
/// `refreshToken` is present because mobile logs in with `transport: body`.
public struct AuthSession: Sendable, Equatable {
    public let user: UserSummary
    public let memberships: [Membership]
    public let activeMembershipId: UUID
    public let accessToken: String
    public let accessExpiresIn: Double
    public let refreshToken: String?

    public init(
        user: UserSummary,
        memberships: [Membership],
        activeMembershipId: UUID,
        accessToken: String,
        accessExpiresIn: Double,
        refreshToken: String?
    ) {
        self.user = user
        self.memberships = memberships
        self.activeMembershipId = activeMembershipId
        self.accessToken = accessToken
        self.accessExpiresIn = accessExpiresIn
        self.refreshToken = refreshToken
    }
}

/// Rotated pair from POST /auth/refresh (body transport → refreshToken set).
public struct TokenPair: Sendable, Equatable {
    public let accessToken: String
    public let accessExpiresIn: Double
    public let refreshToken: String?

    public init(accessToken: String, accessExpiresIn: Double, refreshToken: String?) {
        self.accessToken = accessToken
        self.accessExpiresIn = accessExpiresIn
        self.refreshToken = refreshToken
    }
}

/// Result of POST /auth/switch — same session, re-issued access token.
public struct SwitchedMembership: Sendable, Equatable {
    public let accessToken: String
    public let accessExpiresIn: Double
    public let activeMembershipId: UUID

    public init(accessToken: String, accessExpiresIn: Double, activeMembershipId: UUID) {
        self.accessToken = accessToken
        self.accessExpiresIn = accessExpiresIn
        self.activeMembershipId = activeMembershipId
    }
}

/// The signed-in context the root router renders from.
public struct SessionContext: Sendable, Equatable {
    public let user: UserSummary
    public let memberships: [Membership]
    public let activeMembership: Membership

    public init(user: UserSummary, memberships: [Membership], activeMembership: Membership) {
        self.user = user
        self.memberships = memberships
        self.activeMembership = activeMembership
    }

    /// Builds the context from a login session and the chosen membership id.
    /// Returns nil when the id is not among the session's memberships.
    public init?(session: AuthSession, activeMembershipId: UUID) {
        guard let active = session.memberships.first(where: { $0.id == activeMembershipId }) else {
            return nil
        }
        self.init(user: session.user, memberships: session.memberships, activeMembership: active)
    }
}
