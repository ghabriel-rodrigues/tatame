// Ranking screen model (spec 013, REP.17 — stories 11-20): one screen, two
// segments (Por aulas / Por eventos), each segment cached after its first
// load so flipping back is instant; the professor renders the same data
// without the "você" affordances (professors are not ranked).

import Foundation
import Observation
import TatameCore

/// Which shell is rendering the screen — drives title, footnote copy and
/// the "você" affordances (aluno only, per the four screenshots).
public enum RankingPersona: Sendable, Equatable {
    case aluno
    case professor
}

@MainActor
@Observable
public final class RankingModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(Ranking)
        case failed(message: String)
    }

    public let persona: RankingPersona
    public let academyName: String?
    /// Selected segment (Por aulas first, per aluno-06/professor-05).
    public var segment: RankingBy = .lessons

    /// Per-segment phases — each segment loads once and stays cached.
    public private(set) var phases: [RankingBy: Phase] = [:]

    @ObservationIgnored private let repository: any RankingsRepository

    public init(persona: RankingPersona, academyName: String?, repository: any RankingsRepository) {
        self.persona = persona
        self.academyName = academyName
        self.repository = repository
    }

    public var phase: Phase {
        phases[segment] ?? .idle
    }

    public var ranking: Ranking? {
        if case .loaded(let ranking) = phase { return ranking }
        return nil
    }

    /// Flips the segment and lazily loads it on first visit.
    public func select(_ by: RankingBy) async {
        segment = by
        if case .loaded = phases[by] ?? .idle { return }
        await load(by)
    }

    /// Loads (or reloads) one segment.
    public func load(_ by: RankingBy? = nil) async {
        let target = by ?? segment
        if case .loaded = phases[target] ?? .idle {} else {
            phases[target] = .loading
        }
        do {
            phases[target] = .loaded(try await repository.ranking(by: target))
        } catch let error as ApiError {
            phases[target] = .failed(message: Self.message(for: error))
        } catch {
            phases[target] = .failed(message: RankingsMessages.loadFailed)
        }
    }

    /// Header subtitle for the selected segment (dynamic per the four
    /// screenshots; the window label waits for the loaded payload).
    public var subtitle: String {
        let label = ranking?.window.label ?? ""
        return RankingsMessages.subtitlePTBR(by: segment, windowLabel: label, academyName: academyName)
    }

    /// Selos footnote for the selected segment (professor copy is
    /// per-segment — the professor-06 fix).
    public var footnote: String {
        RankingsMessages.footnotePTBR(persona: persona, by: segment)
    }

    static func message(for error: ApiError) -> String {
        if case .network = error { return RankingsMessages.offline }
        return RankingsMessages.loadFailed
    }
}

/// Small self-loading model behind the aluno home "Ranking do mês" entry
/// card and the professor dashboard "Ranking de presença" section — one
/// lessons fetch, best-effort (failures keep the entry point rendered with
/// its invitation copy rather than blocking the home).
@MainActor
@Observable
public final class RankingEntryModel {
    public private(set) var ranking: Ranking?

    @ObservationIgnored private let repository: any RankingsRepository

    public init(repository: any RankingsRepository) {
        self.repository = repository
    }

    public func load() async {
        ranking = try? await repository.ranking(by: .lessons)
    }

    /// Aluno home card line ("Você está em 2º em presença — continue assim").
    public var homeCardLine: String {
        RankingsFormatters.homeCardLinePTBR(me: ranking?.me)
    }

    /// Professor dashboard section rows (top 3 of the month).
    public var topThree: [RankingRow] {
        Array((ranking?.top ?? []).prefix(3))
    }

    /// "Ranking de presença · julho" — the dashboard section title.
    public var dashboardTitle: String {
        guard let ranking else { return "Ranking de presença" }
        let month = RankingsFormatters.monthNamePTBR(windowLabel: ranking.window.label).lowercased()
        return "Ranking de presença · \(month)"
    }
}
