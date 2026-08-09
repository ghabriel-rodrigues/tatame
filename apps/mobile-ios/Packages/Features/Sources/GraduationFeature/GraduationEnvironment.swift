// Environment seam for the graduation repository (composition root injects
// the Live implementation; previews/tests inject fakes — ticket 06 pattern,
// same as AttendanceEnvironment).

import SwiftUI
import TatameCore

private struct GraduationRepositoryKey: EnvironmentKey {
    static let defaultValue: any GraduationRepository = UnimplementedGraduationRepository()
}

public extension EnvironmentValues {
    var graduationRepository: any GraduationRepository {
        get { self[GraduationRepositoryKey.self] }
        set { self[GraduationRepositoryKey.self] = newValue }
    }
}
