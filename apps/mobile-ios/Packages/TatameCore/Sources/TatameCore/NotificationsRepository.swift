// Repository seam for the notifications slice (spec 010, NOT.12-13). Same
// convention as StoreRepository: protocol in TatameCore, implementation in
// TatameAPI, features depend only on this protocol and throw `ApiError`.
// The endpoints are persona-neutral — one seam feeds the aluno, professor
// and responsável shells alike.

import Foundation

public protocol NotificationsRepository: Sendable {
    /// GET /notifications?cursor= — own rows, newest first, cursor-paged.
    func list(cursor: String?) async throws -> NotificationsPage

    /// GET /notifications/unread-count — 0 while the active membership is
    /// muted (the mute suppresses the badge, never the history).
    func unreadCount() async throws -> Int

    /// POST /notifications/:id/read — idempotent; foreign/cross-tenant ids
    /// are 404.
    func markRead(notificationId: UUID) async throws -> NotificationItem

    /// POST /notifications/read-all — returns how many rows flipped
    /// unread → read.
    func markAllRead() async throws -> Int

    /// GET /notifications/settings — the active membership's
    /// notifications_enabled flag (the perfil "Notificações" switch).
    func settingsEnabled() async throws -> Bool

    /// PUT /notifications/settings — flips the flag; rows keep being
    /// written, only the badge goes quiet.
    func updateSettings(enabled: Bool) async throws -> Bool
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedNotificationsRepository: NotificationsRepository {
    public init() {}

    public func list(cursor _: String?) async throws -> NotificationsPage {
        fatalError("NotificationsRepository not injected")
    }

    public func unreadCount() async throws -> Int {
        fatalError("NotificationsRepository not injected")
    }

    public func markRead(notificationId _: UUID) async throws -> NotificationItem {
        fatalError("NotificationsRepository not injected")
    }

    public func markAllRead() async throws -> Int {
        fatalError("NotificationsRepository not injected")
    }

    public func settingsEnabled() async throws -> Bool {
        fatalError("NotificationsRepository not injected")
    }

    public func updateSettings(enabled _: Bool) async throws -> Bool {
        fatalError("NotificationsRepository not injected")
    }
}
