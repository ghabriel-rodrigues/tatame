// Professor "Minhas turmas" list model (spec 003, ENR.24 — story 24).
// MV @Observable per ticket 06: init-injected repository, phase state.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class ProfessorTurmasModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded([ClassSummary])
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any EnrollmentRepository

    public init(repository: any EnrollmentRepository) {
        self.repository = repository
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.professorClasses())
        } catch let error as ApiError {
            phase = .failed(message: EnrollmentMessages.message(for: error))
        } catch {
            phase = .failed(message: EnrollmentMessages.generic)
        }
    }
}
