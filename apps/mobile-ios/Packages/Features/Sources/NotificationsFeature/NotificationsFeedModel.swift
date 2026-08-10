// Notificações screen model (spec 010, NOT.12-13): cursor-paged list
// (newest first), read-all fired on open (the dot always means something
// new), route taps resolved through the persona plan by the view. Read-all
// is best-effort — a failure never blocks the feed from rendering.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class NotificationsFeedModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    /// Accumulated pages, newest first as served.
    public private(set) var items: [NotificationItem] = []
    public private(set) var nextCursor: String?
    public private(set) var isLoadingMore = false
    /// True once the open's read-all round-trip flipped rows (badge died).
    public private(set) var clearedOnOpen = false

    @ObservationIgnored private let repository: any NotificationsRepository
    /// Fired when read-all succeeds so the shell kills the header dot
    /// without another unread-count round trip.
    @ObservationIgnored private let onBadgeCleared: (@MainActor () -> Void)?

    public init(
        repository: any NotificationsRepository,
        onBadgeCleared: (@MainActor () -> Void)? = nil
    ) {
        self.repository = repository
        self.onBadgeCleared = onBadgeCleared
    }

    public var hasMore: Bool { nextCursor != nil }

    /// Screen open: first page + the spec's read-all on open. Order matters
    /// for the UI — the list renders regardless of the read-all outcome.
    public func open() async {
        await loadFirstPage()
        await markAllRead()
    }

    /// Pull-to-refresh: reload from the top (rows are already read by the
    /// open's read-all; a refresh re-fires it for anything that arrived).
    public func refresh() async {
        await loadFirstPage()
        await markAllRead()
    }

    public func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await repository.list(cursor: cursor)
            // Keyset pages never overlap server-side; the id filter keeps
            // the list stable if a refresh raced the scroll.
            let known = Set(items.map(\.id))
            items += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            // Silent: the next scroll retriggers; the page already renders.
            nextCursor = cursor
        }
    }

    private func loadFirstPage() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            let page = try await repository.list(cursor: nil)
            items = page.items
            nextCursor = page.nextCursor
            phase = .loaded
        } catch let error as ApiError {
            if items.isEmpty { phase = .failed(message: NotificationsMessages.message(for: error)) }
        } catch {
            if items.isEmpty { phase = .failed(message: NotificationsMessages.generic) }
        }
    }

    private func markAllRead() async {
        do {
            _ = try await repository.markAllRead()
            clearedOnOpen = true
            onBadgeCleared?()
        } catch {
            // Best-effort (spec: opening clears the badge; a failed
            // read-all just leaves the dot for the next open).
        }
    }
}
