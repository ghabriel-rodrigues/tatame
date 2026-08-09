// PT-BR display helpers for the billing slice (UI copy only — code stays
// English, per the charter). Mirrors the handoff labels: "R$ 180,00",
// "Mensalidade · agosto", "Vence em 10 de agosto", "Paga em 08/07 · Pix",
// "Plano mensal recorrente · R$ 180,00". Amounts are integer cents.

import Foundation

public enum BillingFormatters {
    private static let ptBR = Locale(identifier: "pt_BR")

    /// "R$ 180,00" from integer cents (pt-BR grouping/decimal).
    public static func amountBRL(_ cents: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = ptBR
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        let value = Double(cents) / 100
        let number = formatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
        return "R$ \(number)"
    }

    private static func date(fromISO iso: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: iso)
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = ptBR
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    /// Lowercased pt-BR month name from a competência ISO date: "agosto".
    /// nil when the payload has no periodStart.
    public static func monthNamePTBR(fromISO iso: String?) -> String? {
        guard let iso, let date = date(fromISO: iso) else { return nil }
        return format(date, "MMMM").lowercased()
    }

    /// Card/history title: "Mensalidade · agosto" ("Mensalidade" when the
    /// competência is unknown).
    public static func mensalidadeTitlePTBR(periodStart: String?) -> String {
        guard let month = monthNamePTBR(fromISO: periodStart) else { return "Mensalidade" }
        return "Mensalidade · \(month)"
    }

    /// Sheet subtitle: "Mensalidade de agosto" (+ " · <context>" appended by
    /// callers: academy on the aluno sheet, child name on the responsável).
    public static func mensalidadeDePTBR(periodStart: String?) -> String {
        guard let month = monthNamePTBR(fromISO: periodStart) else { return "Mensalidade" }
        return "Mensalidade de \(month)"
    }

    /// "Vence em 10 de agosto" from the due-date ISO.
    public static func dueLinePTBR(fromISO iso: String) -> String {
        guard let date = date(fromISO: iso) else { return "Vence em \(iso)" }
        return "Vence em \(format(date, "d 'de' MMMM").lowercased())"
    }

    /// Short due date for the boleto subtitle: "10/08".
    public static func shortDatePTBR(fromISO iso: String) -> String {
        guard let date = date(fromISO: iso) else { return iso }
        return format(date, "dd/MM")
    }

    /// "1 de setembro" — the recurrence banner's next vencimento.
    public static func longDatePTBR(fromISO iso: String) -> String {
        guard let date = date(fromISO: iso) else { return iso }
        return format(date, "d 'de' MMMM").lowercased()
    }

    /// Method labels per the handoff histórico rows: Pix / boleto / cartão.
    public static func methodLabelPTBR(_ method: PaymentMethod) -> String {
        switch method {
        case .pix: "Pix"
        case .boleto: "boleto"
        case .card: "cartão"
        }
    }

    /// Recurrence adjective for the plan header: mensal / trimestral /
    /// semestral / anual.
    public static func recurrenceLabelPTBR(_ recurrence: BillingRecurrence) -> String {
        switch recurrence {
        case .monthly: "mensal"
        case .quarterly: "trimestral"
        case .semiannual: "semestral"
        case .yearly: "anual"
        }
    }

    /// Carteira header subtitle: "Plano mensal recorrente · R$ 180,00".
    public static func planHeaderPTBR(plan: AcademyPlan) -> String {
        "Plano \(recurrenceLabelPTBR(plan.recurrence)) recorrente · \(amountBRL(plan.amountCents))"
    }

    /// History paid line: "Paga em 08/07 · Pix" ("Paga · Pix" without date;
    /// refunded rows read "Estornada").
    public static func historyLinePTBR(entry: WalletHistoryEntry) -> String {
        let method = methodLabelPTBR(entry.method)
        if entry.chargeStatus == .refunded {
            return "Estornada · \(method)"
        }
        guard let paidAt = entry.paidAt else { return "Paga · \(method)" }
        let formatter = DateFormatter()
        formatter.locale = ptBR
        formatter.dateFormat = "dd/MM"
        return "Paga em \(formatter.string(from: paidAt)) · \(method)"
    }

    /// Paid-state line on the mensalidade card: "Paga hoje via Pix" /
    /// "Paga em 02/08 via recorrência no cartão" (responsável story 19).
    public static func paidLinePTBR(payment: Payment, recurrenceActive: Bool = false, now: Date = Date()) -> String {
        let via: String =
            if payment.method == .card, recurrenceActive {
                "via recorrência no cartão"
            } else {
                "via \(payment.method == .pix ? "Pix" : methodLabelPTBR(payment.method))"
            }
        guard let paidAt = payment.paidAt else { return "Paga \(via)" }
        if Calendar.current.isDate(paidAt, inSameDayAs: now) {
            return "Paga hoje \(via)"
        }
        let formatter = DateFormatter()
        formatter.locale = ptBR
        formatter.dateFormat = "dd/MM"
        return "Paga em \(formatter.string(from: paidAt)) \(via)"
    }

    /// Responsável card title: "Pedro · agosto" (first name + competência).
    public static func dependentChargeTitlePTBR(fullName: String, periodStart: String?) -> String {
        let first = fullName.split(separator: " ").first.map(String.init) ?? fullName
        guard let month = monthNamePTBR(fromISO: periodStart) else { return first }
        return "\(first) · \(month)"
    }

    /// Responsável open-card subtitle: "Vence em 10 de agosto · plano Kids
    /// mensal" (plan part dropped when unknown).
    public static func dependentDueLinePTBR(dueDate: String, plan: AcademyPlan?) -> String {
        let due = dueLinePTBR(fromISO: dueDate)
        guard let plan else { return due }
        return "\(due) · plano \(plan.name) \(recurrenceLabelPTBR(plan.recurrence))"
    }

    /// Recurrence banner copy: "Cobrança recorrente ativa. A próxima
    /// mensalidade chega em 1 de setembro com aviso automático."
    public static func recurrenceBannerPTBR(nextChargeDueDate: String?) -> String {
        guard let next = nextChargeDueDate else {
            return "Cobrança recorrente ativa. A próxima mensalidade chega com aviso automático."
        }
        return "Cobrança recorrente ativa. A próxima mensalidade chega em \(longDatePTBR(fromISO: next)) com aviso automático."
    }

    /// Home/dependent alert title: "Mensalidade de agosto" (em aberto).
    public static func alertTitlePTBR(alert: MensalidadeAlert) -> String {
        mensalidadeDePTBR(periodStart: alert.periodStart)
    }

    /// Home alert line: "R$ 180,00 · vence em 10 de agosto".
    public static func alertLinePTBR(alert: MensalidadeAlert) -> String {
        let due = dueLinePTBR(fromISO: alert.dueDate)
        return "\(amountBRL(alert.amountCents)) · \(due.prefix(1).lowercased() + due.dropFirst())"
    }

    /// Client-side last4 derivation for the card display metadata (digits
    /// only; nil until at least 4 digits were typed).
    public static func cardLast4(fromNumber number: String) -> String? {
        let digits = number.filter(\.isNumber)
        guard digits.count >= 4 else { return nil }
        return String(digits.suffix(4))
    }
}
