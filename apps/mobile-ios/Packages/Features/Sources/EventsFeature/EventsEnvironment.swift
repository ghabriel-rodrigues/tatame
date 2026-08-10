// Environment seam for the events repository (composition root injects the
// Live implementation; previews/tests inject fakes — ticket 06 pattern, same
// as BillingEnvironment).

import SwiftUI
import TatameCore

private struct EventsRepositoryKey: EnvironmentKey {
    static let defaultValue: any EventsRepository = UnimplementedEventsRepository()
}

public extension EnvironmentValues {
    var eventsRepository: any EventsRepository {
        get { self[EventsRepositoryKey.self] }
        set { self[EventsRepositoryKey.self] = newValue }
    }
}
