// PT-BR display helpers for enrollment models (UI copy only — code stays
// English, per the charter). Shared by the professor and responsável
// features and their tests, mirroring the handoff labels:
// "Seg · Qua · Sex 19:00 – 20:30", "34 de 34 vagas", "Ter e Qui 18:00".

import Foundation

public enum WeekdayLabels {
    /// Handoff short labels indexed by the contract's weekday (0 = Sunday).
    public static let shortPTBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

    public static func short(_ weekday: Int) -> String {
        guard (0...6).contains(weekday) else { return "?" }
        return shortPTBR[weekday]
    }
}

public extension ScheduleSlot {
    /// "20:30" for a 19:00 + 90 min slot; nil when startTime is malformed.
    var endTime: String? {
        let parts = startTime.split(separator: ":")
        guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]) else {
            return nil
        }
        let total = (hour * 60 + minute + durationMinutes) % (24 * 60)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

public extension Array where Element == ScheduleSlot {
    /// Handoff class-card line: "Seg · Qua · Sex 19:00 – 20:30".
    /// Assumes the common case of one shared time across weekdays (the turma
    /// creation form fans one time out to N weekday rows).
    var scheduleLinePTBR: String {
        guard let first = self.first else { return "Sem horário definido" }
        let days = map { WeekdayLabels.short($0.weekday) }.joined(separator: " · ")
        guard let end = first.endTime else { return "\(days) \(first.startTime)" }
        return "\(days) \(first.startTime) – \(end)"
    }

    /// Suggestion-chip form: "Ter e Qui 18:00" (handoff responsavel-08).
    var suggestionLinePTBR: String {
        guard let first = self.first else { return "" }
        let names = map { WeekdayLabels.short($0.weekday) }
        let days: String
        switch names.count {
        case 1: days = names[0]
        default: days = names.dropLast().joined(separator: ", ") + " e " + names[names.count - 1]
        }
        return "\(days) \(first.startTime)"
    }
}

public extension ClassSummary {
    /// Handoff occupancy chip: "34 de 34 vagas".
    var occupancyLabelPTBR: String {
        "\(occupancy) de \(capacity) vagas"
    }

    /// Handoff Kids age chip: "4 a 12 anos"; nil when the turma has no range.
    var ageRangeLabelPTBR: String? {
        switch (ageMin, ageMax) {
        case let (.some(min), .some(max)): "\(min) a \(max) anos"
        case let (.some(min), nil): "a partir de \(min) anos"
        case let (nil, .some(max)): "até \(max) anos"
        case (nil, nil): nil
        }
    }

    /// 0…1 fill for the occupancy progress bar.
    var occupancyFraction: Double {
        guard capacity > 0 else { return 0 }
        return Swift.min(1, Double(occupancy) / Double(capacity))
    }
}

public enum BirthDates {
    /// Strict ISO "yyyy-MM-dd" parser (the contract's date form).
    public static func parseISO(_ iso: String) -> DateComponents? {
        let parts = iso.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              (1...12).contains(month), (1...31).contains(day)
        else { return nil }
        return DateComponents(year: year, month: month, day: day)
    }

    /// Age in whole years at `now`; nil for malformed input.
    public static func age(fromISO iso: String, now: Date = Date()) -> Int? {
        guard let components = parseISO(iso) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        guard let birth = calendar.date(from: components) else { return nil }
        let age = calendar.dateComponents([.year], from: birth, to: now).year ?? 0
        return max(0, age)
    }

    /// "9 anos" / "1 ano" (handoff dependent card).
    public static func ageLabelPTBR(fromISO iso: String, now: Date = Date()) -> String? {
        guard let age = age(fromISO: iso, now: now) else { return nil }
        return age == 1 ? "1 ano" : "\(age) anos"
    }

    /// PT-BR "dd/mm/aaaa" form input → ISO "yyyy-MM-dd"; nil while the
    /// entry is incomplete or invalid (the suggestion-fetch gate).
    public static func isoFromBR(_ br: String) -> String? {
        let digits = br.filter(\.isNumber)
        guard digits.count == 8 else { return nil }
        let day = Int(digits.prefix(2)) ?? 0
        let month = Int(digits.dropFirst(2).prefix(2)) ?? 0
        let year = Int(digits.suffix(4)) ?? 0
        guard (1...31).contains(day), (1...12).contains(month), year >= 1900 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let components = DateComponents(year: year, month: month, day: day)
        guard let date = calendar.date(from: components),
              calendar.component(.day, from: date) == day,
              calendar.component(.month, from: date) == month
        else { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }
}

public enum NameInitials {
    /// "Lucas Almeida" → "LA" (handoff avatar circles).
    public static func from(_ fullName: String) -> String {
        let parts = fullName.split(separator: " ").filter { !$0.isEmpty }
        guard let first = parts.first?.first else { return "?" }
        guard parts.count > 1, let last = parts.last?.first else {
            return String(first).uppercased()
        }
        return (String(first) + String(last)).uppercased()
    }
}

public extension ScheduleSlot {
    /// Handoff "próxima aula" tile value: "Ter 18:00".
    var nextSlotLabelPTBR: String {
        "\(WeekdayLabels.short(weekday)) \(startTime)"
    }
}
