// Environment seam for the profile repository (composition root injects
// the Live implementation; previews/tests inject fakes — ticket 06 pattern,
// same as GraduationEnvironment).

import SwiftUI
import TatameCore

private struct ProfileRepositoryKey: EnvironmentKey {
    static let defaultValue: any ProfileRepository = UnimplementedProfileRepository()
}

public extension EnvironmentValues {
    var profileRepository: any ProfileRepository {
        get { self[ProfileRepositoryKey.self] }
        set { self[ProfileRepositoryKey.self] = newValue }
    }
}
