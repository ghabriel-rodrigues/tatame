// Generated `Components.Schemas.*` → TatameCore ranking models (spec 013,
// REP.17; same convention as GraduationMapping).

import Foundation
import TatameCore

extension RankingWindow {
    init(dto: Components.Schemas.ReportWindowDto) {
        self.init(label: dto.label, start: dto.start, endExclusive: dto.endExclusive)
    }
}

extension RankingRow {
    init(dto: Components.Schemas.RankingRowDto) {
        self.init(
            position: Int(dto.position),
            name: dto.name,
            count: Int(dto.count),
            isMe: dto.isMe
        )
    }
}

extension RankingMe {
    init(dto: Components.Schemas.RankingMeDto) {
        self.init(position: Int(dto.position), count: Int(dto.count))
    }
}

extension Ranking {
    init(dto: Components.Schemas.RankingResponseDto) {
        self.init(
            by: RankingBy(rawValue: dto.by.rawValue) ?? .lessons,
            window: RankingWindow(dto: dto.window.value1),
            top: dto.top.map(RankingRow.init(dto:)),
            me: dto.me.map { RankingMe(dto: $0.value1) },
            totalRanked: Int(dto.totalRanked)
        )
    }
}
