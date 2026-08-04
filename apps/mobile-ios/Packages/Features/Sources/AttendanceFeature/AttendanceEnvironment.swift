// Environment seam for the attendance repository (composition root injects
// the Live implementation; previews/tests inject fakes — ticket 06 pattern,
// same as EnrollmentEnvironment).

import SwiftUI
import TatameCore

private struct AttendanceRepositoryKey: EnvironmentKey {
    static let defaultValue: any AttendanceRepository = UnimplementedAttendanceRepository()
}

public extension EnvironmentValues {
    var attendanceRepository: any AttendanceRepository {
        get { self[AttendanceRepositoryKey.self] }
        set { self[AttendanceRepositoryKey.self] = newValue }
    }
}
