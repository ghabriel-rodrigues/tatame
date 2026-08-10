// Environment seam for the notifications repository (composition root
// injects the Live implementation; previews/tests inject fakes — ticket 06
// pattern, same as StoreEnvironment).

import SwiftUI
import TatameCore

private struct NotificationsRepositoryKey: EnvironmentKey {
    static let defaultValue: any NotificationsRepository = UnimplementedNotificationsRepository()
}

public extension EnvironmentValues {
    var notificationsRepository: any NotificationsRepository {
        get { self[NotificationsRepositoryKey.self] }
        set { self[NotificationsRepositoryKey.self] = newValue }
    }
}
