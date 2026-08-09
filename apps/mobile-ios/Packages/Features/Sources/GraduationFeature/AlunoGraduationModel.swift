// Aluno Graduação model (spec 005, GRD.22 — stories 1-5): GET
// /aluno/graduation hero + progress + evolution timeline.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class AlunoGraduationModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(AlunoGraduation)
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any GraduationRepository

    public init(repository: any GraduationRepository) {
        self.repository = repository
    }

    public var graduation: AlunoGraduation? {
        if case .loaded(let graduation) = phase { return graduation }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.alunoGraduation())
        } catch let error as ApiError {
            phase = .failed(message: GraduationMessages.message(for: error, notFound: GraduationMessages.loadFailed))
        } catch {
            phase = .failed(message: GraduationMessages.generic)
        }
    }
}
