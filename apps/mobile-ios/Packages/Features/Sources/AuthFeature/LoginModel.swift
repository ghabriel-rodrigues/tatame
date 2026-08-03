// LoginModel — feature model per ticket 06 (MV, @MainActor @Observable,
// init-injected dependencies). Owns the login form state, PT-BR error
// mapping on stable codes, and the multi-membership chooser phase.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class LoginModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case submitting
        case failed(message: String)
        /// Multiple memberships: the chooser must pick before entering.
        case choosingMembership(AuthSession)
    }

    /// PT-BR copy for login errors (UI copy only).
    public enum Messages {
        public static let fillFields = "Preencha email e senha."
        public static let invalidCredentials = "Email ou senha incorretos."
        public static let mfaWebOnly = "Sua conta usa verificação em duas etapas. Entre pelo console web."
        public static let offline = "Sem conexão com a internet. Tente novamente."
        public static let validation = "Confira os campos e tente novamente."
        public static let generic = "Algo deu errado. Tente novamente."
    }

    public var email = ""
    public var password = ""
    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let session: SessionStore

    public init(session: SessionStore) {
        self.session = session
    }

    /// Submits the credentials. On success with one membership the
    /// `SessionStore` flips to `.signedIn` (root router takes over); with
    /// several, moves to the chooser phase.
    public func submit() async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, !password.isEmpty else {
            phase = .failed(message: Messages.fillFields)
            return
        }
        phase = .submitting
        do {
            let authSession = try await session.login(email: email, password: password)
            if authSession.memberships.count > 1 {
                phase = .choosingMembership(authSession)
            } else {
                phase = .idle
            }
        } catch let error as ApiError {
            phase = .failed(message: Self.message(for: error))
        } catch {
            phase = .failed(message: Messages.generic)
        }
    }

    /// Completes a multi-membership login with the chosen membership.
    public func choose(_ membership: Membership) async {
        guard case .choosingMembership(let authSession) = phase else { return }
        do {
            try await session.selectMembership(membership.id, from: authSession)
            phase = .idle
        } catch let error as ApiError {
            phase = .failed(message: Self.message(for: error))
        } catch {
            phase = .failed(message: Messages.generic)
        }
    }

    /// Aborts the chooser back to the login form (sheet dismissed).
    public func cancelChooser() {
        if case .choosingMembership = phase {
            phase = .idle
        }
    }

    /// Maps the typed ApiError to PT-BR copy — branching on stable codes
    /// only (ticket 02).
    public static func message(for error: ApiError) -> String {
        switch error {
        case .unauthorized(let code) where code == ApiErrorCode.invalidCredentials:
            Messages.invalidCredentials
        case .unauthorized(let code) where code == ApiErrorCode.mfaRequired:
            Messages.mfaWebOnly
        case .network:
            Messages.offline
        case .validation:
            Messages.validation
        default:
            Messages.generic
        }
    }
}
