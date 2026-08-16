// Repository seam for the rankings slice (spec 013, REP.17). Same
// convention as GraduationRepository: protocol in TatameCore, implementation
// in TatameAPI, features depend only on this protocol and throw `ApiError`.

import Foundation

public protocol RankingsRepository: Sendable {
    /// GET /rankings?by=lessons|events — academy-wide, current month /
    /// semester in the tenant timezone (the server defaults the window).
    func ranking(by: RankingBy) async throws -> Ranking
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedRankingsRepository: RankingsRepository {
    public init() {}

    public func ranking(by _: RankingBy) async throws -> Ranking {
        fatalError("RankingsRepository not injected")
    }
}
