// Environment seam for the billing repository (composition root injects the
// Live implementation; previews/tests inject fakes — ticket 06 pattern, same
// as AttendanceEnvironment).

import SwiftUI
import TatameCore

private struct BillingRepositoryKey: EnvironmentKey {
    static let defaultValue: any BillingRepository = UnimplementedBillingRepository()
}

public extension EnvironmentValues {
    var billingRepository: any BillingRepository {
        get { self[BillingRepositoryKey.self] }
        set { self[BillingRepositoryKey.self] = newValue }
    }
}
