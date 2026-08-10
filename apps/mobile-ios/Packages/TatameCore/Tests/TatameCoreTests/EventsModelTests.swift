import Foundation
import Testing
@testable import TatameCore

@Suite("Events PT-BR formatters & model helpers")
struct EventsModelTests {
    // MARK: Formatters (spec 008 fixed copy)

    @Test("valor chip: Gratuito when nil, R$ otherwise")
    func valorChip() {
        #expect(EventFormatters.valorChipPTBR(priceCents: nil) == "Gratuito")
        #expect(EventFormatters.valorChipPTBR(priceCents: 6000) == "R$ 60,00")
    }

    @Test("pay CTA and Pix subtitle carry the handoff copy")
    func payAndInscricao() {
        #expect(EventFormatters.payButtonPTBR(priceCents: 6000) == "Pagar inscrição · R$ 60,00")
        #expect(EventFormatters.inscricaoPTBR(eventName: "Open mat de verão") == "Inscrição · Open mat de verão")
    }

    @Test("detail date line: 'Sábado, 15 de agosto · 10:00' with the Data a definir fallback")
    func dateLine() {
        #expect(EventFormatters.dateLinePTBR(date: "2026-08-15", time: "10:00") == "Sábado, 15 de agosto · 10:00")
        #expect(EventFormatters.dateLinePTBR(date: "2026-08-15", time: nil) == "Sábado, 15 de agosto")
        #expect(EventFormatters.dateLinePTBR(date: nil, time: "10:00") == "Data a definir")
    }

    @Test("card line abbreviates the weekday (responsavel-06)")
    func shortDateLine() {
        #expect(EventFormatters.shortDateLinePTBR(date: "2026-09-15", time: "09:30") == "Ter, 15 de setembro · 09:30")
    }

    @Test("date square splits day over abbreviated month")
    func daySquare() {
        let square = EventFormatters.daySquare(date: "2026-08-15")
        #expect(square?.day == "15")
        #expect(square?.month == "ago")
        #expect(EventFormatters.daySquare(date: nil) == nil)
    }

    @Test("professor list line pluralizes confirmados and renders the valor")
    func professorLine() {
        #expect(EventFormatters.professorEventLinePTBR(confirmedCount: 18, priceCents: nil) == "18 confirmados · Gratuito")
        #expect(EventFormatters.professorEventLinePTBR(confirmedCount: 1, priceCents: 6000) == "1 confirmado · R$ 60,00")
    }

    // MARK: EventListItem calendar helpers (the pink-dot source)

    private func item(
        date: String?,
        time: String? = "10:00",
        registration: EventRegistrationState? = nil
    ) -> EventListItem {
        EventListItem(
            id: UUID(),
            name: "Open mat",
            bannerPreset: "event-purple-pink",
            location: nil,
            date: date,
            time: time,
            priceCents: nil,
            registration: registration
        )
    }

    @Test("dayOfMonth resolves inside the month and nil outside it")
    func dayOfMonth() {
        #expect(item(date: "2026-08-15").dayOfMonth(inMonth: "2026-08") == 15)
        #expect(item(date: "2026-09-15").dayOfMonth(inMonth: "2026-08") == nil)
        #expect(item(date: nil).dayOfMonth(inMonth: "2026-08") == nil)
    }

    @Test("PersonaCalendar eventDays and events(onDay:) bucket + sort by time")
    func calendarEventBuckets() {
        let calendar = PersonaCalendar(
            month: "2026-08",
            classesByWeekday: [:],
            events: [
                item(date: "2026-08-22", time: "14:00"),
                item(date: "2026-08-15", time: "10:00"),
                item(date: "2026-08-15", time: "08:00"),
                item(date: "2026-09-01"),
            ]
        )

        #expect(calendar.eventDays == [15, 22])
        let day15 = calendar.events(onDay: 15)
        #expect(day15.count == 2)
        #expect(day15[0].time == "08:00")
        #expect(calendar.events(onDay: 3).isEmpty)
    }

    @Test("registration state helpers: canceled reads as not registered")
    func registrationHelpers() {
        let confirmed = EventRegistrationState(id: UUID(), status: .confirmed)
        let pending = EventRegistrationState(id: UUID(), status: .pendingPayment, chargeId: UUID())
        let canceled = EventRegistrationState(id: UUID(), status: .canceled)

        #expect(confirmed.isConfirmed)
        #expect(pending.isPendingPayment)
        #expect(!canceled.isConfirmed && !canceled.isPendingPayment)
        #expect(item(date: "2026-08-15", registration: confirmed).isConfirmed)
        #expect(!item(date: "2026-08-15", registration: canceled).isConfirmed)
    }
}
