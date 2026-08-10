// Environment seam for the store repository (composition root injects the
// Live implementation; previews/tests inject fakes — ticket 06 pattern, same
// as EventsEnvironment).

import SwiftUI
import TatameCore

private struct StoreRepositoryKey: EnvironmentKey {
    static let defaultValue: any StoreRepository = UnimplementedStoreRepository()
}

public extension EnvironmentValues {
    var storeRepository: any StoreRepository {
        get { self[StoreRepositoryKey.self] }
        set { self[StoreRepositoryKey.self] = newValue }
    }
}
