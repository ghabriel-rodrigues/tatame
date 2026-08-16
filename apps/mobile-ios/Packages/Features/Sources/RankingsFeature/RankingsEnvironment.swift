// Environment seam for the rankings repository (composition root injects
// the Live implementation; previews/tests inject fakes — ticket 06 pattern,
// same as GraduationEnvironment).

import SwiftUI
import TatameCore

private struct RankingsRepositoryKey: EnvironmentKey {
    static let defaultValue: any RankingsRepository = UnimplementedRankingsRepository()
}

public extension EnvironmentValues {
    var rankingsRepository: any RankingsRepository {
        get { self[RankingsRepositoryKey.self] }
        set { self[RankingsRepositoryKey.self] = newValue }
    }
}
