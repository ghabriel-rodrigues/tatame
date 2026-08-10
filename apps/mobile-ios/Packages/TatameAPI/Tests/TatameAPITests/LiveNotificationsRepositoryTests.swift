import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveNotificationsRepository (generated client → domain mapping)")
struct LiveNotificationsRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let notificationId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e1")!
    private static let eventId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000e2")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveNotificationsRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveNotificationsRepository(client: client), transport)
    }

    private func json(_ body: String, status: HTTPResponse.Status = .ok) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(body.utf8))
    }

    private func problem(status: Int, code: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8))
    }

    // MARK: List

    @Test("list maps the render-ready rows + cursor and hits the bare route")
    func listMapping() async throws {
        let body = """
        {"notifications": [
            {"id": "\(Self.notificationId.uuidString.lowercased())", "category": "payment",
             "chip": "R$", "title": "Mensalidade de agosto disponível",
             "body": "Vence em 10 de agosto · R$ 180,00", "route": "wallet",
             "readAt": null, "createdAt": "2026-08-10T12:00:00.000Z"},
            {"id": "\(UUID().uuidString.lowercased())", "category": "event",
             "chip": "15", "title": "Open mat de verão",
             "body": "Sábado, 15 de agosto às 10:00 — confirme sua presença",
             "route": "event/\(Self.eventId.uuidString.lowercased())",
             "readAt": "2026-08-09T15:00:00.000Z", "createdAt": "2026-08-09T12:00:00.000Z"},
            {"id": "\(UUID().uuidString.lowercased())", "category": "graduation",
             "chip": null, "title": "Você recebeu o 2º grau",
             "body": null, "route": null,
             "readAt": null, "createdAt": "2026-08-01T12:00:00.000Z"}
        ],
         "nextCursor": "opaque-cursor-1"}
        """
        let (repository, transport) = makeRepository([json(body)])

        let page = try await repository.list(cursor: nil)

        #expect(transport.requests[0].0.path == "/v1/notifications")
        #expect(page.items.count == 3)
        #expect(page.nextCursor == "opaque-cursor-1")

        #expect(page.items[0].category == .payment)
        #expect(page.items[0].chip == "R$")
        #expect(page.items[0].title == "Mensalidade de agosto disponível")
        #expect(page.items[0].body == "Vence em 10 de agosto · R$ 180,00")
        #expect(page.items[0].route == .wallet)
        #expect(page.items[0].isUnread)

        #expect(page.items[1].route == .event(id: Self.eventId))
        #expect(!page.items[1].isUnread)

        // Null chip → category icon fallback; null route → inert row.
        #expect(page.items[2].chip == nil)
        #expect(page.items[2].route == nil)
    }

    @Test("the cursor rides the query string; the tail page has no nextCursor")
    func listCursor() async throws {
        let (repository, transport) = makeRepository([json("{\"notifications\": [], \"nextCursor\": null}")])

        let page = try await repository.list(cursor: "opaque-cursor-1")

        let path = try #require(transport.requests[0].0.path)
        #expect(path.hasPrefix("/v1/notifications?"))
        #expect(path.contains("cursor=opaque-cursor-1"))
        // Honest empty state — no fabricated rows, pagination stops.
        #expect(page.items.isEmpty)
        #expect(page.nextCursor == nil)
    }

    @Test("an unknown category refuses to map (closed vocabulary)")
    func listUnknownCategory() async throws {
        let body = """
        {"notifications": [
            {"id": "\(Self.notificationId.uuidString.lowercased())", "category": "mystery",
             "title": "?", "createdAt": "2026-08-10T12:00:00.000Z"}
        ]}
        """
        let (repository, _) = makeRepository([json(body)])

        await #expect(throws: ApiError.self) {
            _ = try await repository.list(cursor: nil)
        }
    }

    // MARK: Badge

    @Test("unreadCount maps the count (0 while muted)")
    func unreadCount() async throws {
        let (repository, transport) = makeRepository([json("{\"count\": 3}"), json("{\"count\": 0}")])

        let count = try await repository.unreadCount()

        #expect(transport.requests[0].0.path == "/v1/notifications/unread-count")
        #expect(count == 3)
        // The muted membership answers 0 with no client-side branching.
        #expect(try await repository.unreadCount() == 0)
    }

    // MARK: Mark read

    @Test("markRead posts the id route and maps the flipped row")
    func markRead() async throws {
        let body = """
        {"notification":
            {"id": "\(Self.notificationId.uuidString.lowercased())", "category": "store",
             "chip": "#2431", "title": "Pedido #2431 pago",
             "body": "Kimono oficial — retire na recepção da academia", "route": "orders",
             "readAt": "2026-08-10T13:00:00.000Z", "createdAt": "2026-08-10T12:00:00.000Z"}}
        """
        let (repository, transport) = makeRepository([json(body)])

        let item = try await repository.markRead(notificationId: Self.notificationId)

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(request.path == "/v1/notifications/\(Self.notificationId.uuidString.lowercased())/read")
        #expect(!item.isUnread)
        #expect(item.route == .orders)
    }

    @Test("foreign/cross-tenant ids behave as 404 with the stable code")
    func markReadForeign() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.markRead(notificationId: Self.notificationId)
        }
    }

    @Test("markAllRead posts read-all and maps the flipped-row count")
    func markAllRead() async throws {
        let (repository, transport) = makeRepository([json("{\"updated\": 4}")])

        let updated = try await repository.markAllRead()

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(request.path == "/v1/notifications/read-all")
        #expect(updated == 4)
    }

    // MARK: Settings (the perfil switch)

    @Test("settingsEnabled reads the membership flag")
    func settingsGet() async throws {
        let (repository, transport) = makeRepository([json("{\"enabled\": true}")])

        let enabled = try await repository.settingsEnabled()

        #expect(transport.requests[0].0.path == "/v1/notifications/settings")
        #expect(enabled)
    }

    @Test("updateSettings puts the flag and returns the server echo")
    func settingsPut() async throws {
        let (repository, transport) = makeRepository([json("{\"enabled\": false}")])

        let enabled = try await repository.updateSettings(enabled: false)

        let request = transport.requests[0].0
        #expect(request.method == .put)
        #expect(request.path == "/v1/notifications/settings")
        let sent = try #require(transport.requests[0].1)
        let sentJSON = try #require(try JSONSerialization.jsonObject(with: sent) as? [String: Any])
        #expect(sentJSON["enabled"] as? Bool == false)
        // Mute echoes back — the switch renders the server truth.
        #expect(enabled == false)
    }
}
