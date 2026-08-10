// PT-BR display helpers for the events slice (UI copy only — code stays
// English, per the charter). Mirrors the handoff labels: "Gratuito",
// "R$ 60,00", "Pagar inscrição · R$ 60,00", "Sábado, 15 de agosto · 10:00",
// the "15 / ago" date square and "Inscrição · Open mat de verão".

import Foundation

public enum EventFormatters {
    /// Valor chip: "Gratuito" when priceCents is nil, "R$ 60,00" otherwise
    /// (spec 008 — "Gratuito renders when price_cents is NULL").
    public static func valorChipPTBR(priceCents: Int?) -> String {
        guard let priceCents else { return "Gratuito" }
        return BillingFormatters.amountBRL(priceCents)
    }

    /// Paid CTA: "Pagar inscrição · R$ 60,00".
    public static func payButtonPTBR(priceCents: Int) -> String {
        "Pagar inscrição · \(BillingFormatters.amountBRL(priceCents))"
    }

    /// Pix sheet subtitle: "Inscrição · Open mat de verão" (guardian variant
    /// appends the child's name — callers compose).
    public static func inscricaoPTBR(eventName: String) -> String {
        "Inscrição · \(eventName)"
    }

    private static func parse(_ iso: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: iso)
    }

    private static func weekdayIndex(_ iso: String) -> Int? {
        guard let date = parse(iso) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.component(.weekday, from: date) - 1
    }

    static let weekdayShortPTBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

    /// "15 de agosto" from the tenant-local ISO date.
    public static func dayMonthPTBR(fromISO iso: String) -> String {
        guard let date = parse(iso) else { return iso }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "d 'de' MMMM"
        return formatter.string(from: date).lowercased()
    }

    /// Detail info row: "Sábado, 15 de agosto · 10:00" (aluno-10); falls back
    /// to "Data a definir" when the date is missing (unreachable on published
    /// surfaces, kept honest).
    public static func dateLinePTBR(date: String?, time: String?) -> String {
        guard let date, let weekday = weekdayIndex(date) else { return "Data a definir" }
        let line = "\(MonthGrid.weekdayNamesPTBR[weekday]), \(dayMonthPTBR(fromISO: date))"
        guard let time else { return line }
        return "\(line) · \(time)"
    }

    /// Card line: "Sáb, 15 de agosto · 10:00" (responsavel-06 abbreviates).
    public static func shortDateLinePTBR(date: String?, time: String?) -> String {
        guard let date, let weekday = weekdayIndex(date) else { return "Data a definir" }
        let line = "\(weekdayShortPTBR[weekday]), \(dayMonthPTBR(fromISO: date))"
        guard let time else { return line }
        return "\(line) · \(time)"
    }

    /// Date square pieces ("15" over "ago", aluno-11 event cards); nil when
    /// undated.
    public static func daySquare(date: String?) -> (day: String, month: String)? {
        guard let date, let parsed = parse(date) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "d"
        let day = formatter.string(from: parsed)
        formatter.dateFormat = "MMM"
        let month = formatter.string(from: parsed).lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return (day, month)
    }

    /// Professor list line: "18 confirmados · Gratuito" / "12 confirmados ·
    /// R$ 60,00" (professor-02, spec 008 story 22).
    public static func professorEventLinePTBR(confirmedCount: Int, priceCents: Int?) -> String {
        let noun = confirmedCount == 1 ? "confirmado" : "confirmados"
        return "\(confirmedCount) \(noun) · \(valorChipPTBR(priceCents: priceCents))"
    }
}
