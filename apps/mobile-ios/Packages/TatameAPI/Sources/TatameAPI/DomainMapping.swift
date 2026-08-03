// Thin, boring mapping from generated `Components.Schemas.*` types to the
// TatameCore domain models (ticket 02, decision 3: features never see
// generated types).

import Foundation
import TatameCore

extension UserSummary {
    init(dto: Components.Schemas.UserSummaryDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid user id: \(dto.id)")
        }
        self.init(id: id, email: dto.email, fullName: dto.fullName)
    }

    init(dto: Components.Schemas.MeUserDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid user id: \(dto.id)")
        }
        self.init(id: id, email: dto.email, fullName: dto.fullName)
    }
}

extension Membership {
    init(dto: Components.Schemas.MembershipViewDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid membership id: \(dto.id)")
        }
        guard let role = MembershipRole(rawValue: dto.role.rawValue) else {
            throw ApiError.decoding(description: "unknown role: \(dto.role.rawValue)")
        }
        self.init(
            id: id,
            type: MembershipType(rawValue: dto._type.rawValue) ?? .academy,
            role: role,
            tenantId: dto.tenantId.flatMap(UUID.init(uuidString:)),
            academyName: dto.academyName,
            academyStatus: dto.academyStatus.flatMap(AcademyStatus.init(rawValue:)),
            status: dto.status
        )
    }
}

extension AuthSession {
    init(dto: Components.Schemas.AuthSessionResponseDto) throws {
        guard let activeId = UUID(uuidString: dto.activeMembershipId) else {
            throw ApiError.decoding(description: "invalid active membership id")
        }
        self.init(
            user: try UserSummary(dto: dto.user),
            memberships: try dto.memberships.map(Membership.init(dto:)),
            activeMembershipId: activeId,
            accessToken: dto.accessToken,
            accessExpiresIn: dto.accessExpiresIn,
            refreshToken: dto.refreshToken
        )
    }
}

extension TokenPair {
    init(dto: Components.Schemas.TokenPairResponseDto) {
        self.init(
            accessToken: dto.accessToken,
            accessExpiresIn: dto.accessExpiresIn,
            refreshToken: dto.refreshToken
        )
    }
}

extension SwitchedMembership {
    init(dto: Components.Schemas.SwitchMembershipResponseDto) throws {
        guard let activeId = UUID(uuidString: dto.activeMembershipId) else {
            throw ApiError.decoding(description: "invalid active membership id")
        }
        self.init(
            accessToken: dto.accessToken,
            accessExpiresIn: dto.accessExpiresIn,
            activeMembershipId: activeId
        )
    }
}

extension SessionContext {
    init(dto: Components.Schemas.MeResponseDto) throws {
        let user = try UserSummary(dto: dto.user)
        let memberships = try dto.memberships.map(Membership.init(dto:))
        guard
            let activeIdString = dto.activeMembershipId,
            let activeId = UUID(uuidString: activeIdString),
            let active = memberships.first(where: { $0.id == activeId })
        else {
            throw ApiError.decoding(description: "active membership missing from /auth/me")
        }
        self.init(user: user, memberships: memberships, activeMembership: active)
    }
}
