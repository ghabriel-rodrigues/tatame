// Environment seam for the enrollment repository (composition root injects
// the Live implementation; previews/tests inject fakes — ticket 06 pattern).

import SwiftUI
import TatameCore

private struct EnrollmentRepositoryKey: EnvironmentKey {
    static let defaultValue: any EnrollmentRepository = UnimplementedEnrollmentRepository()
}

public extension EnvironmentValues {
    var enrollmentRepository: any EnrollmentRepository {
        get { self[EnrollmentRepositoryKey.self] }
        set { self[EnrollmentRepositoryKey.self] = newValue }
    }
}
