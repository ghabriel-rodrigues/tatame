// PT-BR display helpers for the notifications slice (UI copy only — code
// stays English, per the charter). The feed rows arrive render-ready from
// the API; the one client-side rendering job is the relative timestamp of
// aluno-20 / responsavel-09: "Hoje", "Ontem", weekday abbreviation inside
// the last week ("Seg"), month abbreviation beyond it ("Jun").

import Foundation

public enum NotificationsFormatters {
    static let weekdayShortPTBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    static let monthShortPTBR = [
        "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ]

    /// Relative PT-BR timestamp per the prototype fixtures: same day →
    /// "Hoje"; the day before → "Ontem"; 2-6 days back → the weekday
    /// abbreviation; older → the month abbreviation. Future timestamps
    /// (clock skew) clamp to "Hoje".
    public static func relativeTimestampPTBR(
        _ date: Date,
        now: Date = Date(),
        calendar: Calendar = Calendar.current
    ) -> String {
        let day = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: now)
        let days = calendar.dateComponents([.day], from: day, to: today).day ?? 0
        switch days {
        case ..<1:
            return "Hoje"
        case 1:
            return "Ontem"
        case 2...6:
            return weekdayShortPTBR[calendar.component(.weekday, from: date) - 1]
        default:
            return monthShortPTBR[calendar.component(.month, from: date) - 1]
        }
    }
}
