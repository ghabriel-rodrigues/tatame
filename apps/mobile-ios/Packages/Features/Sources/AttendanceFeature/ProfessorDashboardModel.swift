// Professor dashboard model (spec 004, ATT.24 — stories 34-36): live tiles
// (alunos hoje, presença média) and the next-class hero with its check-in
// count. Ranking/graduation/payment sections stay explicit placeholders
// owned by their slices.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class ProfessorDashboardModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(ProfessorDashboard)
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    /// Live chamada opened from the hero — non-nil presents the sheet.
    public var chamadaClassId: UUID?

    @ObservationIgnored private let repository: any AttendanceRepository

    public init(repository: any AttendanceRepository) {
        self.repository = repository
    }

    public var dashboard: ProfessorDashboard? {
        if case .loaded(let dashboard) = phase { return dashboard }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.dashboard())
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }

    public func iniciarChamada() {
        guard let nextClass = dashboard?.nextClass else { return }
        chamadaClassId = nextClass.classId
    }
}
