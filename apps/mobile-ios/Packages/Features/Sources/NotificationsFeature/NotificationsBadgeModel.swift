// Home-header badge model (spec 010): the unread count behind the bell's
// pink dot, refetched on screen focus. Strictly best-effort — a failed
// fetch keeps the last known value and never surfaces an error (the badge
// is an affordance, not a feature).

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class NotificationsBadgeModel {
    public private(set) var unreadCount = 0

    @ObservationIgnored private let repository: any NotificationsRepository

    public init(repository: any NotificationsRepository) {
        self.repository = repository
    }

    public var hasUnread: Bool { unreadCount > 0 }

    /// Refetch (home focus / return from the feed). Muted memberships get 0
    /// from the server — the dot goes quiet with no client-side branching.
    public func refresh() async {
        if let count = try? await repository.unreadCount() {
            unreadCount = count
        }
    }

    /// Optimistic clear when the feed's read-all succeeded.
    public func clear() {
        unreadCount = 0
    }
}
