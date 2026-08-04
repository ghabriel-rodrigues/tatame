// Aluno Início model (spec 004, ATT.22 — stories 10, 13-17): GET /aluno/home
// hero + stat tiles; a successful check-in applies the fresh stats and flips
// the hero without a second round trip.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class AlunoHomeModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(AlunoHome)
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    public var showCheckinSheet = false

    @ObservationIgnored private let repository: any AttendanceRepository

    public init(repository: any AttendanceRepository) {
        self.repository = repository
    }

    public var home: AlunoHome? {
        if case .loaded(let home) = phase { return home }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.alunoHome())
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }

    /// One round trip updates the pop and the tiles (story 15) and flips the
    /// hero to "Presença registrada" (story 10).
    public func applyCheckin(_ result: CheckinResult) {
        guard case .loaded(let home) = phase else { return }
        phase = .loaded(home.applying(result))
    }
}
