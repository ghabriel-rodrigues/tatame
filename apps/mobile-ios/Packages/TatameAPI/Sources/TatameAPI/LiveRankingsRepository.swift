// LiveRankingsRepository — the generated Client wrapped behind the
// TatameCore protocol (spec 013, REP.17; same pattern as
// LiveGraduationRepository). The month query stays server-defaulted (current
// month/semester in the tenant timezone).

import Foundation
import TatameCore

struct LiveRankingsRepository: RankingsRepository {
    let client: Client

    func ranking(by: RankingBy) async throws -> Ranking {
        try await ApiErrorMapper.run {
            let byPayload: Operations.RankingsController_ranking_v1.Input.Query.byPayload =
                switch by {
                case .lessons: .lessons
                case .events: .events
                }
            let response = try await client.RankingsController_ranking_v1(
                .init(query: .init(by: byPayload))
            )
            switch response {
            case .ok(let ok):
                return Ranking(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
