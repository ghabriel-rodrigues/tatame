// Generated `Components.Schemas.*` → TatameCore notification models (spec
// 010; same convention as StoreMapping: features never see generated types).

import Foundation
import TatameCore

extension NotificationItem {
    init(dto: Components.Schemas.NotificationDto) throws {
        guard let id = UUID(uuidString: dto.id) else {
            throw ApiError.decoding(description: "invalid notification id: \(dto.id)")
        }
        guard let category = NotificationCategory(rawValue: dto.category.rawValue) else {
            throw ApiError.decoding(description: "unknown notification category: \(dto.category.rawValue)")
        }
        self.init(
            id: id,
            category: category,
            chip: dto.chip,
            title: dto.title,
            body: dto.body,
            routeHint: dto.route,
            readAt: dto.readAt,
            createdAt: dto.createdAt
        )
    }
}

extension NotificationsPage {
    init(dto: Components.Schemas.NotificationsListResponseDto) throws {
        self.init(
            items: try dto.notifications.map(NotificationItem.init(dto:)),
            nextCursor: dto.nextCursor
        )
    }
}
