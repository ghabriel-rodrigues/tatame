import Foundation
import Testing
@testable import TatameCore

@Suite("Notifications models & PT-BR formatters (spec 010)")
struct NotificationsModelTests {
    private static let notificationId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f1")!
    private static let eventId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f2")!

    // A fixed calendar so the relative-timestamp cases never depend on the
    // host machine's locale/zone.
    private static var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private static func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
        utcCalendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    // MARK: Semantic route parsing (spec 010 — DB rows never encode router paths)

    @Test("the four static hints parse to their routes")
    func staticRoutes() {
        #expect(NotificationRoute.parse("wallet") == .wallet)
        #expect(NotificationRoute.parse("graduation") == .graduation)
        #expect(NotificationRoute.parse("orders") == .orders)
        #expect(NotificationRoute.parse("store") == .store)
    }

    @Test("event/{id} parses the UUID")
    func eventRoute() {
        let parsed = NotificationRoute.parse("event/\(Self.eventId.uuidString.lowercased())")
        #expect(parsed == .event(id: Self.eventId))
    }

    @Test("unknown, malformed and null hints are inert (nil)")
    func inertRoutes() {
        #expect(NotificationRoute.parse(nil) == nil)
        #expect(NotificationRoute.parse("") == nil)
        #expect(NotificationRoute.parse("dashboard") == nil)
        #expect(NotificationRoute.parse("event/") == nil)
        #expect(NotificationRoute.parse("event/not-a-uuid") == nil)
        #expect(NotificationRoute.parse("wallet/extra") == nil)
    }

    @Test("the item exposes the parsed route and unread state")
    func itemHelpers() {
        let unread = NotificationItem(
            id: Self.notificationId,
            category: .payment,
            chip: "R$",
            title: "Mensalidade de agosto disponível",
            body: "Vence em 10 de agosto · R$ 180,00",
            routeHint: "wallet",
            readAt: nil,
            createdAt: Self.date(2026, 8, 10)
        )
        #expect(unread.isUnread)
        #expect(unread.route == .wallet)

        let read = NotificationItem(
            id: Self.notificationId,
            category: .graduation,
            title: "Você recebeu o 2º grau",
            routeHint: "unknown-hint",
            readAt: Self.date(2026, 8, 10),
            createdAt: Self.date(2026, 8, 9)
        )
        #expect(!read.isUnread)
        #expect(read.route == nil)
    }

    @Test("the category vocabulary is the closed five of the prototypes")
    func categories() {
        #expect(NotificationCategory.allCases.map(\.rawValue) == [
            "payment", "event", "graduation", "attendance", "store",
        ])
    }

    // MARK: Relative timestamp (aluno-20 / responsavel-09: Hoje/Ontem/weekday/month)

    @Test("same day renders Hoje regardless of hour")
    func today() {
        let now = Self.date(2026, 8, 10, hour: 22)
        let morning = Self.date(2026, 8, 10, hour: 1)
        #expect(NotificationsFormatters.relativeTimestampPTBR(morning, now: now, calendar: Self.utcCalendar) == "Hoje")
    }

    @Test("the day before renders Ontem")
    func yesterday() {
        let now = Self.date(2026, 8, 10, hour: 0)
        let lateYesterday = Self.date(2026, 8, 9, hour: 23)
        #expect(NotificationsFormatters.relativeTimestampPTBR(lateYesterday, now: now, calendar: Self.utcCalendar) == "Ontem")
    }

    @Test("2-6 days back renders the PT-BR weekday abbreviation")
    func weekday() {
        let now = Self.date(2026, 8, 10) // Monday
        // Saturday, 2 days back.
        #expect(NotificationsFormatters.relativeTimestampPTBR(Self.date(2026, 8, 8), now: now, calendar: Self.utcCalendar) == "Sáb")
        // Tuesday, 6 days back.
        #expect(NotificationsFormatters.relativeTimestampPTBR(Self.date(2026, 8, 4), now: now, calendar: Self.utcCalendar) == "Ter")
    }

    @Test("a week or older renders the PT-BR month abbreviation")
    func month() {
        let now = Self.date(2026, 8, 10)
        // Exactly 7 days back leaves the weekday window.
        #expect(NotificationsFormatters.relativeTimestampPTBR(Self.date(2026, 8, 3), now: now, calendar: Self.utcCalendar) == "Ago")
        #expect(NotificationsFormatters.relativeTimestampPTBR(Self.date(2026, 6, 20), now: now, calendar: Self.utcCalendar) == "Jun")
        #expect(NotificationsFormatters.relativeTimestampPTBR(Self.date(2025, 12, 31), now: now, calendar: Self.utcCalendar) == "Dez")
    }

    @Test("future timestamps (clock skew) clamp to Hoje")
    func futureClamps() {
        let now = Self.date(2026, 8, 10)
        #expect(NotificationsFormatters.relativeTimestampPTBR(Self.date(2026, 8, 12), now: now, calendar: Self.utcCalendar) == "Hoje")
    }
}
