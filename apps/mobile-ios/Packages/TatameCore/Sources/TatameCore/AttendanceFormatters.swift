// PT-BR display helpers for the attendance slice (UI copy only — code stays
// English, per the charter). Mirrors the handoff labels: "Expira em 09:42",
// "Essa é a sua 7ª aula seguida", "3 presentes de 14", "Hoje às 10:00".

import Foundation

public enum AttendanceFormatters {
    /// "09:42" mm:ss countdown to `deadline`; "00:00" once passed. Hours are
    /// folded into minutes (a chamada window never spans days).
    public static func countdown(until deadline: Date, from now: Date = Date()) -> String {
        let remaining = max(0, Int(deadline.timeIntervalSince(now).rounded(.down)))
        return String(format: "%02d:%02d", remaining / 60, remaining % 60)
    }

    /// Success-pop streak line: "Essa é a sua 7ª aula seguida. Bom treino!"
    /// nil when the academy disabled streak gamification (streak omitted).
    public static func streakLinePTBR(streak: Int?) -> String? {
        guard let streak, streak > 0 else { return nil }
        return "Essa é a sua \(streak)ª aula seguida. Bom treino!"
    }

    /// Presence tile value: 86.4 → "86%".
    public static func percentLabel(_ pct: Double) -> String {
        "\(Int(pct.rounded()))%"
    }

    /// Manual chamada header: "3 presentes de 14".
    public static func presentesLabelPTBR(present: Int, total: Int) -> String {
        "\(present) \(present == 1 ? "presente" : "presentes") de \(total)"
    }

    /// Live counter line: "6 alunos já registraram presença".
    public static func liveCounterLabelPTBR(_ count: Int) -> String {
        count == 1
            ? "1 aluno já registrou presença"
            : "\(count) alunos já registraram presença"
    }

    /// Hero chip: "Hoje às 10:00".
    public static func todayChipPTBR(slot: ScheduleSlot) -> String {
        "Hoje às \(slot.startTime)"
    }

    /// Check-in sheet subtitle time range: "Hoje, 10:00 – 12:00".
    public static func todayRangePTBR(slot: ScheduleSlot) -> String {
        guard let end = slot.endTime else { return "Hoje, \(slot.startTime)" }
        return "Hoje, \(slot.startTime) – \(end)"
    }

    /// Home header date line: "sábado, 1 de agosto".
    public static func headerDatePTBR(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.dateFormat = "EEEE, d 'de' MMMM"
        return formatter.string(from: date).lowercased()
    }

    /// Time-of-day greeting: "Bom dia" / "Boa tarde" / "Boa noite".
    public static func greetingPTBR(hour: Int) -> String {
        switch hour {
        case 5..<12: "Bom dia"
        case 12..<18: "Boa tarde"
        default: "Boa noite"
        }
    }

    /// First name for greetings: "Lucas Almeida" → "Lucas".
    public static func firstName(_ fullName: String) -> String {
        fullName.split(separator: " ").first.map(String.init) ?? fullName
    }
}
