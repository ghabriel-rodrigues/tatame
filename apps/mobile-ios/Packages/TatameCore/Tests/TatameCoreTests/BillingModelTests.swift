import Foundation
import Testing
@testable import TatameCore

@Suite("Billing PT-BR formatters & model helpers")
struct BillingModelTests {
    // MARK: Fixtures

    private static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000c1")!
    private static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000c2")!
    private static let paymentId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000c3")!

    private func payment(
        status: PaymentStatus = .succeeded,
        method: PaymentMethod = .pix,
        paidAt: Date? = nil
    ) -> Payment {
        Payment(
            id: Self.paymentId,
            chargeId: Self.chargeId,
            method: method,
            status: status,
            amountCents: 18000,
            currency: "BRL",
            provider: .simulated,
            paidAt: paidAt
        )
    }

    private func charge(
        status: ChargeStatus = .open,
        overdue: Bool = false,
        payments: [Payment] = []
    ) -> Charge {
        Charge(
            id: Self.chargeId,
            studentId: Self.studentId,
            status: status,
            overdue: overdue,
            amountCents: 18000,
            currency: "BRL",
            dueDate: "2026-08-10",
            periodStart: "2026-08-01",
            payments: payments
        )
    }

    /// Local-calendar date so dd/MM formatting is timezone-stable in tests.
    private func localDate(year: Int, month: Int, day: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    // MARK: Amounts

    @Test("amountBRL formats integer cents in pt-BR")
    func amounts() {
        #expect(BillingFormatters.amountBRL(18000) == "R$ 180,00")
        #expect(BillingFormatters.amountBRL(15000) == "R$ 150,00")
        #expect(BillingFormatters.amountBRL(0) == "R$ 0,00")
        #expect(BillingFormatters.amountBRL(1234567) == "R$ 12.345,67")
        #expect(BillingFormatters.amountBRL(5) == "R$ 0,05")
    }

    // MARK: Month / due-date lines (aluno-12 copy)

    @Test("competência lines: 'Mensalidade · agosto' and 'Mensalidade de agosto'")
    func competenciaLines() {
        #expect(BillingFormatters.monthNamePTBR(fromISO: "2026-08-01") == "agosto")
        #expect(BillingFormatters.mensalidadeTitlePTBR(periodStart: "2026-08-01") == "Mensalidade · agosto")
        #expect(BillingFormatters.mensalidadeDePTBR(periodStart: "2026-08-01") == "Mensalidade de agosto")
        // Unknown competência degrades to the bare label, never invents one.
        #expect(BillingFormatters.mensalidadeTitlePTBR(periodStart: nil) == "Mensalidade")
        #expect(BillingFormatters.monthNamePTBR(fromISO: "not-a-date") == nil)
    }

    @Test("due lines: 'Vence em 10 de agosto', short '10/08', long '1 de setembro'")
    func dueLines() {
        #expect(BillingFormatters.dueLinePTBR(fromISO: "2026-08-10") == "Vence em 10 de agosto")
        #expect(BillingFormatters.shortDatePTBR(fromISO: "2026-08-10") == "10/08")
        #expect(BillingFormatters.longDatePTBR(fromISO: "2026-09-01") == "1 de setembro")
    }

    // MARK: Plan header & recurrence banner

    @Test("plan header: 'Plano mensal recorrente · R$ 180,00' per recurrence")
    func planHeader() {
        let plan = AcademyPlan(
            id: UUID(),
            name: "Mensal",
            amountCents: 18000,
            currency: "BRL",
            recurrence: .monthly,
            dueDay: 10,
            isActive: true
        )
        #expect(BillingFormatters.planHeaderPTBR(plan: plan) == "Plano mensal recorrente · R$ 180,00")
        #expect(BillingFormatters.recurrenceLabelPTBR(.quarterly) == "trimestral")
        #expect(BillingFormatters.recurrenceLabelPTBR(.semiannual) == "semestral")
        #expect(BillingFormatters.recurrenceLabelPTBR(.yearly) == "anual")
    }

    @Test("recurrence banner carries the next vencimento (story 6 copy)")
    func recurrenceBanner() {
        #expect(
            BillingFormatters.recurrenceBannerPTBR(nextChargeDueDate: "2026-09-01")
                == "Cobrança recorrente ativa. A próxima mensalidade chega em 1 de setembro com aviso automático."
        )
        #expect(
            BillingFormatters.recurrenceBannerPTBR(nextChargeDueDate: nil)
                == "Cobrança recorrente ativa. A próxima mensalidade chega com aviso automático."
        )
    }

    // MARK: Paid / history lines

    @Test("history line: 'Paga em 08/07 · Pix'; refunded reads 'Estornada'")
    func historyLines() {
        let paid = WalletHistoryEntry(
            studentId: Self.studentId,
            chargeId: Self.chargeId,
            periodStart: "2026-07-01",
            amountCents: 18000,
            currency: "BRL",
            chargeStatus: .paid,
            paymentId: Self.paymentId,
            method: .pix,
            paidAt: localDate(year: 2026, month: 7, day: 8)
        )
        #expect(BillingFormatters.historyLinePTBR(entry: paid) == "Paga em 08/07 · Pix")

        let card = WalletHistoryEntry(
            studentId: Self.studentId,
            chargeId: Self.chargeId,
            periodStart: "2026-07-01",
            amountCents: 18000,
            currency: "BRL",
            chargeStatus: .paid,
            paymentId: Self.paymentId,
            method: .card,
            paidAt: nil
        )
        #expect(BillingFormatters.historyLinePTBR(entry: card) == "Paga · cartão")

        let refunded = WalletHistoryEntry(
            studentId: Self.studentId,
            chargeId: Self.chargeId,
            periodStart: "2026-07-01",
            amountCents: 18000,
            currency: "BRL",
            chargeStatus: .refunded,
            paymentId: Self.paymentId,
            method: .boleto,
            paidAt: nil
        )
        #expect(BillingFormatters.historyLinePTBR(entry: refunded) == "Estornada · boleto")
    }

    @Test("paid line: 'Paga hoje via Pix' today, dated otherwise, recurrence on card")
    func paidLines() {
        let today = payment(method: .pix, paidAt: Date())
        #expect(BillingFormatters.paidLinePTBR(payment: today) == "Paga hoje via Pix")

        let dated = payment(method: .card, paidAt: localDate(year: 2026, month: 8, day: 2))
        #expect(
            BillingFormatters.paidLinePTBR(payment: dated, recurrenceActive: true, now: localDate(year: 2026, month: 8, day: 9))
                == "Paga em 02/08 via recorrência no cartão"
        )
        #expect(
            BillingFormatters.paidLinePTBR(payment: dated, recurrenceActive: false, now: localDate(year: 2026, month: 8, day: 9))
                == "Paga em 02/08 via cartão"
        )
    }

    // MARK: Responsável copy (responsavel-04)

    @Test("dependent card lines: 'Pedro · agosto' + 'Vence em 10 de agosto · plano Kids mensal'")
    func dependentLines() {
        #expect(
            BillingFormatters.dependentChargeTitlePTBR(fullName: "Pedro Silveira", periodStart: "2026-08-01")
                == "Pedro · agosto"
        )
        let plan = AcademyPlan(
            id: UUID(),
            name: "Kids",
            amountCents: 15000,
            currency: "BRL",
            recurrence: .monthly,
            dueDay: 10,
            isActive: true
        )
        #expect(
            BillingFormatters.dependentDueLinePTBR(dueDate: "2026-08-10", plan: plan)
                == "Vence em 10 de agosto · plano Kids mensal"
        )
        #expect(
            BillingFormatters.dependentDueLinePTBR(dueDate: "2026-08-10", plan: nil)
                == "Vence em 10 de agosto"
        )
    }

    // MARK: Home alert copy (story 7)

    @Test("home alert: 'Mensalidade de agosto' + 'R$ 180,00 · vence em 10 de agosto'")
    func homeAlert() {
        let alert = MensalidadeAlert(
            chargeId: Self.chargeId,
            amountCents: 18000,
            currency: "BRL",
            dueDate: "2026-08-10",
            overdue: false,
            periodStart: "2026-08-01"
        )
        #expect(BillingFormatters.alertTitlePTBR(alert: alert) == "Mensalidade de agosto")
        #expect(BillingFormatters.alertLinePTBR(alert: alert) == "R$ 180,00 · vence em 10 de agosto")
    }

    // MARK: Charge state helpers (wallet chip mapping)

    @Test("charge chip states: open/overdue → Em aberto, paid → Paga")
    func chargeStates() {
        #expect(charge(status: .open).isOpen)
        #expect(!charge(status: .open).isPaid)
        // Lazily flipped overdue status still reads Em aberto.
        #expect(charge(status: .overdue).isOpen)
        // Derived-truth overdue on a stale open row also reads Em aberto.
        #expect(charge(status: .open, overdue: true).isOpen)
        #expect(charge(status: .paid).isPaid)
        #expect(!charge(status: .paid).isOpen)
        #expect(!charge(status: .canceled).isOpen)
        #expect(!charge(status: .refunded).isPaid)
    }

    @Test("settledPayment picks the succeeded attempt, ignoring failed/pending")
    func settledPayment() {
        let failed = Payment(
            id: UUID(),
            chargeId: Self.chargeId,
            method: .pix,
            status: .failed,
            amountCents: 18000,
            currency: "BRL",
            provider: .simulated
        )
        let succeeded = payment(status: .succeeded)
        let paid = charge(status: .paid, payments: [failed, succeeded])
        #expect(paid.settledPayment == succeeded)
        #expect(charge(status: .open, payments: [failed]).settledPayment == nil)
    }

    // MARK: Card last4 derivation (display metadata only)

    @Test("cardLast4 derives from digits only; nil under 4 digits")
    func cardLast4() {
        #expect(BillingFormatters.cardLast4(fromNumber: "4242 4242 4242 4242") == "4242")
        #expect(BillingFormatters.cardLast4(fromNumber: "5555-1111-2222-9876") == "9876")
        #expect(BillingFormatters.cardLast4(fromNumber: "123") == nil)
        #expect(BillingFormatters.cardLast4(fromNumber: "") == nil)
    }
}
