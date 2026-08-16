import Foundation
import Testing
@testable import TatameCore

@Suite("Rankings domain model + formatters (spec 013, REP.17)")
struct RankingsModelTests {
    private func ranking(
        by: RankingBy = .lessons,
        top: [RankingRow],
        me: RankingMe? = nil
    ) -> Ranking {
        Ranking(
            by: by,
            window: RankingWindow(label: "2026-08", start: "2026-08-01", endExclusive: "2026-09-01"),
            top: top,
            me: me,
            totalRanked: 20
        )
    }

    @Test("bar fractions scale to the leader and clamp to 0...1")
    func barFractions() {
        let model = ranking(top: [
            RankingRow(position: 1, name: "Marina Costa", count: 17, isMe: false),
            RankingRow(position: 2, name: "Lucas Almeida", count: 14, isMe: true),
        ])
        #expect(model.barFraction(count: 17) == 1)
        #expect(abs(model.barFraction(count: 14) - 14.0 / 17.0) < 0.0001)
        #expect(model.barFraction(count: 0) == 0)
    }

    @Test("a zero-count leader yields empty bars, not division by zero")
    func zeroLeader() {
        let model = ranking(top: [RankingRow(position: 1, name: "A", count: 0, isMe: false)])
        #expect(model.barFraction(count: 0) == 0)
    }

    @Test("meOutsideTop is true only when the requester is below the cut")
    func meOutsideTop() {
        let insideTop = ranking(
            top: [RankingRow(position: 2, name: "Lucas", count: 14, isMe: true)],
            me: RankingMe(position: 2, count: 14)
        )
        #expect(!insideTop.meOutsideTop)

        let outsideTop = ranking(
            top: [RankingRow(position: 1, name: "Marina", count: 17, isMe: false)],
            me: RankingMe(position: 12, count: 3)
        )
        #expect(outsideTop.meOutsideTop)

        let professor = ranking(top: [RankingRow(position: 1, name: "Marina", count: 17, isMe: false)])
        #expect(!professor.meOutsideTop)
    }

    @Test("count labels pluralize per segment")
    func countLabels() {
        #expect(RankingsFormatters.countLabelPTBR(count: 17, by: .lessons) == "17 aulas")
        #expect(RankingsFormatters.countLabelPTBR(count: 1, by: .lessons) == "1 aula")
        #expect(RankingsFormatters.countLabelPTBR(count: 5, by: .events) == "5 eventos")
        #expect(RankingsFormatters.countLabelPTBR(count: 1, by: .events) == "1 evento")
    }

    @Test("month name derives from the window label in pt-BR")
    func monthName() {
        #expect(RankingsFormatters.monthNamePTBR(windowLabel: "2026-08") == "Agosto")
        #expect(RankingsFormatters.monthNamePTBR(windowLabel: "2026-01") == "Janeiro")
        // Semester and malformed labels fall back to the raw label.
        #expect(RankingsFormatters.monthNamePTBR(windowLabel: "2026-S2") == "2026-S2")
    }

    @Test("home card line carries the live position (aluno-03 copy)")
    func homeCardLine() {
        #expect(
            RankingsFormatters.homeCardLinePTBR(me: RankingMe(position: 2, count: 14))
                == "Você está em 2º em presença — continue assim"
        )
        #expect(RankingsFormatters.homeCardLinePTBR(me: nil) == "Veja quem mais treinou na academia neste mês")
    }
}
