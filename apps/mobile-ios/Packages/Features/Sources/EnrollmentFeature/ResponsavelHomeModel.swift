// Responsável dependents panel model (spec 003, ENR.25/26 — stories 30, 36).
// Loads the children and resolves the "cadastrar dependentes" toggle from
// the session's permission map (client-side hiding; the server enforces).

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class ResponsavelHomeModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded([Dependent])
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    /// Story 36: hidden client-side when the academy disabled the toggle.
    public private(set) var canRegisterDependents = true
    /// Cadastrar aluno sheet visibility.
    public var showRegisterSheet = false

    @ObservationIgnored private let repository: any EnrollmentRepository
    @ObservationIgnored private let session: SessionStore

    public init(repository: any EnrollmentRepository, session: SessionStore) {
        self.repository = repository
        self.session = session
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        // Hydrate the permission map (empty right after a fresh login).
        await session.refreshPermissions()
        if case .signedIn(let context) = session.state {
            canRegisterDependents = context.permission(PermissionKey.dependentsRegister, default: true)
        }
        do {
            phase = .loaded(try await repository.dependents())
        } catch let error as ApiError {
            phase = .failed(message: EnrollmentMessages.message(
                for: error,
                notFound: EnrollmentMessages.dependentNotFound
            ))
        } catch {
            phase = .failed(message: EnrollmentMessages.generic)
        }
    }

    /// Called by the register sheet after a successful cadastro.
    public func dependentRegistered() async {
        showRegisterSheet = false
        await load()
    }
}
