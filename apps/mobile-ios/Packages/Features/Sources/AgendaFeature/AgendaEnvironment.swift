// Environment seam for the agenda repository (composition root injects the
// Live implementation; previews/tests inject fakes — ticket 06 pattern, same
// as AttendanceEnvironment).

import SwiftUI
import TatameCore

private struct AgendaRepositoryKey: EnvironmentKey {
    static let defaultValue: any AgendaRepository = UnimplementedAgendaRepository()
}

public extension EnvironmentValues {
    var agendaRepository: any AgendaRepository {
        get { self[AgendaRepositoryKey.self] }
        set { self[AgendaRepositoryKey.self] = newValue }
    }
}
