import Foundation
import Testing
@testable import RankingsFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 013 REP.17)

final class FakeRankingsRepository: RankingsRepository, @unchecked Sendable {
    var results: [RankingBy: Result<Ranking, ApiError>] = [:]
    private(set) var calls: [RankingBy] = []

    func ranking(by: RankingBy) async throws -> Ranking {
        calls.append(by)
        guard let result = results[by] else {
            throw ApiError.unknown(status: 0, code: nil)
        }
        return try result.get()
    }
}

// MARK: - Fixtures

enum RankingsFixtures {
    static func lessons(me: RankingMe? = RankingMe(position: 2, count: 14)) -> Ranking {
        Ranking(
            by: .lessons,
            window: RankingWindow(label: "2026-08", start: "2026-08-01", endExclusive: "2026-09-01"),
            top: [
                RankingRow(position: 1, name: "Marina Costa", count: 17, isMe: false),
                RankingRow(position: 2, name: "Lucas Almeida", count: 14, isMe: me != nil),
                RankingRow(position: 3, name: "Júlia Silveira", count: 13, isMe: false),
                RankingRow(position: 4, name: "Pedro Silveira", count: 12, isMe: false),
            ],
            me: me,
            totalRanked: 23
        )
    }

    static func events() -> Ranking {
        Ranking(
            by: .events,
            window: RankingWindow(label: "2026-S2", start: "2026-07-01", endExclusive: "2027-01-01"),
            top: [
                RankingRow(position: 1, name: "João Ferraz", count: 5, isMe: false),
                RankingRow(position: 2, name: "Lucas Almeida", count: 4, isMe: true),
            ],
            me: RankingMe(position: 2, count: 4),
            totalRanked: 23
        )
    }
}

// MARK: - RankingModel (segments, caching, copy)

@MainActor
@Suite("RankingModel (spec 013, REP.17 — segments, me, footnote)")
struct RankingModelTests {
    @Test("starts on Por aulas and loads that segment")
    func startsOnLessons() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .success(RankingsFixtures.lessons())
        let model = RankingModel(persona: .aluno, academyName: "Horizonte BJJ", repository: repository)

        await model.load()

        #expect(model.segment == .lessons)
        #expect(repository.calls == [.lessons])
        #expect(model.ranking?.top.count == 4)
    }

    @Test("selecting Por eventos lazily loads it once and caches both segments")
    func segmentSwitchCaches() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .success(RankingsFixtures.lessons())
        repository.results[.events] = .success(RankingsFixtures.events())
        let model = RankingModel(persona: .aluno, academyName: nil, repository: repository)

        await model.load()
        await model.select(.events)
        #expect(model.segment == .events)
        #expect(model.ranking?.by == .events)

        // Flipping back hits the cache — no third call.
        await model.select(.lessons)
        #expect(model.ranking?.by == .lessons)
        #expect(repository.calls == [.lessons, .events])
    }

    @Test("subtitle: month + academy on Por aulas, semester line on Por eventos")
    func subtitles() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .success(RankingsFixtures.lessons())
        repository.results[.events] = .success(RankingsFixtures.events())
        let model = RankingModel(persona: .aluno, academyName: "Horizonte BJJ", repository: repository)

        await model.load()
        #expect(model.subtitle == "Agosto · Horizonte BJJ")

        await model.select(.events)
        #expect(model.subtitle == "Participações em eventos no semestre")
    }

    @Test("aluno footnote is the combined selos line on both segments")
    func alunoFootnote() {
        let aluno = RankingsMessages.footnotePTBR(persona: .aluno, by: .lessons)
        #expect(aluno.contains("Constância"))
        #expect(aluno.contains("Espírito de equipe"))
        #expect(RankingsMessages.footnotePTBR(persona: .aluno, by: .events) == aluno)
    }

    @Test("professor footnote is per-segment (the professor-06 prototype fix)")
    func professorFootnote() {
        let lessons = RankingsMessages.footnotePTBR(persona: .professor, by: .lessons)
        let events = RankingsMessages.footnotePTBR(persona: .professor, by: .events)
        #expect(lessons.contains("Constância"))
        #expect(!lessons.contains("Espírito de equipe"))
        #expect(events.contains("Espírito de equipe"))
        #expect(!events.contains("Constância"))
        #expect(lessons != events)
    }

    @Test("titles per persona (aluno-06 vs professor-05)")
    func titles() {
        #expect(RankingsMessages.titlePTBR(persona: .aluno) == "Ranking do mês")
        #expect(RankingsMessages.titlePTBR(persona: .professor) == "Ranking de presença")
    }

    @Test("failed segment carries the PT-BR message and retry reloads")
    func failureAndRetry() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .failure(.network(.notConnectedToInternet))
        let model = RankingModel(persona: .aluno, academyName: nil, repository: repository)

        await model.load()
        #expect(model.phase == .failed(message: RankingsMessages.offline))

        repository.results[.lessons] = .success(RankingsFixtures.lessons())
        await model.load()
        #expect(model.ranking != nil)
    }
}

// MARK: - RankingEntryModel (home card + dashboard section)

@MainActor
@Suite("RankingEntryModel (home card + professor dashboard section)")
struct RankingEntryModelTests {
    @Test("home card line carries the live position from me")
    func homeCardLine() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .success(RankingsFixtures.lessons())
        let model = RankingEntryModel(repository: repository)

        await model.load()

        #expect(model.homeCardLine == "Você está em 2º em presença — continue assim")
    }

    @Test("load failure keeps the invitation copy (best-effort entry point)")
    func failureFallsBack() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .failure(.network(.notConnectedToInternet))
        let model = RankingEntryModel(repository: repository)

        await model.load()

        #expect(model.ranking == nil)
        #expect(model.homeCardLine == "Veja quem mais treinou na academia neste mês")
    }

    @Test("dashboard section: top 3 cut + titled month")
    func dashboardSection() async {
        let repository = FakeRankingsRepository()
        repository.results[.lessons] = .success(RankingsFixtures.lessons())
        let model = RankingEntryModel(repository: repository)

        await model.load()

        #expect(model.topThree.map(\.position) == [1, 2, 3])
        #expect(model.dashboardTitle == "Ranking de presença · agosto")
    }
}
