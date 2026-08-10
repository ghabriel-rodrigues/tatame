// Domain models for the notifications slice (spec 010, NOT.12-13). Mapped
// from the generated OpenAPI types inside TatameAPI — features only ever see
// these (ticket 02 convention). Rows arrive render-ready from the API
// (PT-BR title/body composed server-side); clients only render the relative
// timestamp and map the semantic route hint to shell navigation.

import Foundation

/// Shared contract enum — the closed `notification_category` icon
/// vocabulary of the prototypes (R$ chip, date chip, grau chip, initials
/// chip, store chip). The chip text may be null; clients then fall back to
/// the category's icon.
public enum NotificationCategory: String, Sendable, CaseIterable {
    case payment
    case event
    case graduation
    case attendance
    case store
}

/// Semantic deep-link hint parsed from the row's `route` text. DB rows never
/// encode router paths — each shell maps these to its own navigation
/// (NotificationRoutePlan); unknown/null routes are inert (spec 010).
public enum NotificationRoute: Equatable, Sendable {
    case wallet
    case event(id: UUID)
    case graduation
    case orders
    case store

    /// Parses the server's semantic hint. Anything unrecognized (including
    /// a malformed event id) is nil — the row renders but does not navigate.
    public static func parse(_ raw: String?) -> NotificationRoute? {
        guard let raw else { return nil }
        switch raw {
        case "wallet": return .wallet
        case "graduation": return .graduation
        case "orders": return .orders
        case "store": return .store
        default:
            let prefix = "event/"
            guard raw.hasPrefix(prefix), let id = UUID(uuidString: String(raw.dropFirst(prefix.count))) else {
                return nil
            }
            return .event(id: id)
        }
    }
}

/// One feed row (aluno-20 / responsavel-09 card): 38px icon chip, bold
/// title, body line, relative timestamp.
public struct NotificationItem: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let category: NotificationCategory
    /// Pre-rendered chip label ("R$", "15", "2º", initials); nil = the
    /// category icon renders instead.
    public let chip: String?
    public let title: String
    public let body: String?
    /// Raw semantic hint as served; parse via `route`.
    public let routeHint: String?
    public let readAt: Date?
    public let createdAt: Date

    public init(
        id: UUID,
        category: NotificationCategory,
        chip: String? = nil,
        title: String,
        body: String? = nil,
        routeHint: String? = nil,
        readAt: Date? = nil,
        createdAt: Date
    ) {
        self.id = id
        self.category = category
        self.chip = chip
        self.title = title
        self.body = body
        self.routeHint = routeHint
        self.readAt = readAt
        self.createdAt = createdAt
    }

    /// Parsed semantic route; nil = the row is inert on tap.
    public var route: NotificationRoute? { NotificationRoute.parse(routeHint) }

    public var isUnread: Bool { readAt == nil }
}

/// GET /notifications payload — one cursor page, newest first (~30).
public struct NotificationsPage: Sendable, Equatable {
    public let items: [NotificationItem]
    /// Opaque keyset cursor; nil = no further pages.
    public let nextCursor: String?

    public init(items: [NotificationItem], nextCursor: String? = nil) {
        self.items = items
        self.nextCursor = nextCursor
    }
}
