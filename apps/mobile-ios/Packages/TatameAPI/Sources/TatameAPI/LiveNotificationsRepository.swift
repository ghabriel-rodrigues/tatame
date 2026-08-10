// LiveNotificationsRepository — the generated Client wrapped behind the
// TatameCore protocol (spec 010, NOT.12-13; same pattern as
// LiveStoreRepository). Persona-neutral routes; every error is normalized
// into ApiError, foreign/cross-tenant ids surface as 404.

import Foundation
import TatameCore

struct LiveNotificationsRepository: NotificationsRepository {
    let client: Client

    func list(cursor: String?) async throws -> NotificationsPage {
        try await ApiErrorMapper.run {
            let response = try await client.NotificationsController_list_v1(
                .init(query: .init(cursor: cursor))
            )
            switch response {
            case .ok(let ok):
                return try NotificationsPage(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func unreadCount() async throws -> Int {
        try await ApiErrorMapper.run {
            let response = try await client.NotificationsController_unreadCount_v1(.init())
            switch response {
            case .ok(let ok):
                return Int(try ok.body.json.count)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func markRead(notificationId: UUID) async throws -> NotificationItem {
        try await ApiErrorMapper.run {
            let response = try await client.NotificationsController_read_v1(
                .init(path: .init(id: notificationId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try NotificationItem(dto: try ok.body.json.notification)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func markAllRead() async throws -> Int {
        try await ApiErrorMapper.run {
            let response = try await client.NotificationsController_readAll_v1(.init())
            switch response {
            case .ok(let ok):
                return Int(try ok.body.json.updated)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func settingsEnabled() async throws -> Bool {
        try await ApiErrorMapper.run {
            let response = try await client.NotificationsController_getSettings_v1(.init())
            switch response {
            case .ok(let ok):
                return try ok.body.json.enabled
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func updateSettings(enabled: Bool) async throws -> Bool {
        try await ApiErrorMapper.run {
            let response = try await client.NotificationsController_updateSettings_v1(
                .init(body: .json(.init(enabled: enabled)))
            )
            switch response {
            case .ok(let ok):
                return try ok.body.json.enabled
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
