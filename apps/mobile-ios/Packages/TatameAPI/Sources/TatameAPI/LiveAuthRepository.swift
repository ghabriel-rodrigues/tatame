// LiveAuthRepository — the generated Client wrapped behind the TatameCore
// protocol (ticket 02, decision 3). Every error is normalized into ApiError.

import Foundation
import TatameCore

struct LiveAuthRepository: AuthRepository {
    let client: Client
    let coordinator: TokenRefreshCoordinator

    func login(email: String, password: String) async throws -> AuthSession {
        try await ApiErrorMapper.run {
            let response = try await client.AuthController_login_v1(
                .init(body: .json(.init(email: email, password: password, transport: .body)))
            )
            switch response {
            case .ok(let ok):
                return try AuthSession(dto: try ok.body.json)
            case .accepted:
                // Platform TOTP challenge — mobile sends those users to the
                // web console; surface the stable code for the login UI.
                throw ApiError.unauthorized(code: ApiErrorCode.mfaRequired)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func restoreSession() async throws -> SessionContext {
        try await ApiErrorMapper.run {
            // Single-flight silent refresh (rotates the Keychain token and
            // primes the in-memory access token), then bootstrap.
            _ = try await coordinator.refreshAccessToken()
            let response = try await client.AuthController_me_v1(.init())
            switch response {
            case .ok(let ok):
                return try SessionContext(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func switchMembership(_ membershipId: UUID) async throws -> SwitchedMembership {
        try await ApiErrorMapper.run {
            let response = try await client.AuthController_switch_v1(
                .init(body: .json(.init(membershipId: membershipId.uuidString.lowercased())))
            )
            switch response {
            case .ok(let ok):
                return try SwitchedMembership(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func logout() async throws {
        try await ApiErrorMapper.run {
            let response = try await client.AuthController_logout_v1(.init())
            switch response {
            case .noContent:
                return
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
