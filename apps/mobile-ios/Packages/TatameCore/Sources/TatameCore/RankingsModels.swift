// Domain models for the rankings slice (spec 013, REP.17). One academy-wide
// read model consumed by both the aluno (Ranking do mês) and professor
// (Ranking de presença) screens; bar widths are client-derived from the
// leader's count per the spec.

import Foundation

/// The two segments: Por aulas (calendar month) / Por eventos (semester).
public enum RankingBy: String, Sendable, Equatable, CaseIterable {
    case lessons
    case events
}

/// Tenant-local window the ranking was computed over.
public struct RankingWindow: Sendable, Equatable {
    /// `YYYY-MM` for months, `YYYY-S1`/`YYYY-S2` for semesters.
    public let label: String
    /// Inclusive tenant-local first day, ISO "yyyy-MM-dd".
    public let start: String
    /// Exclusive tenant-local end day, ISO "yyyy-MM-dd".
    public let endExclusive: String

    public init(label: String, start: String, endExclusive: String) {
        self.label = label
        self.start = start
        self.endExclusive = endExclusive
    }
}

/// One top-10 row (position assigned after count-desc, name-asc sort).
public struct RankingRow: Sendable, Equatable, Identifiable {
    public let position: Int
    public let name: String
    public let count: Int
    /// The requesting student's own row ("você" chip).
    public let isMe: Bool

    public var id: Int { position }

    public init(position: Int, name: String, count: Int, isMe: Bool) {
        self.position = position
        self.name = name
        self.count = count
        self.isMe = isMe
    }
}

/// The requesting student's own position (always nil for professors).
public struct RankingMe: Sendable, Equatable {
    public let position: Int
    public let count: Int

    public init(position: Int, count: Int) {
        self.position = position
        self.count = count
    }
}

/// GET /rankings payload.
public struct Ranking: Sendable, Equatable {
    public let by: RankingBy
    public let window: RankingWindow
    /// Top 10.
    public let top: [RankingRow]
    /// Own position for student requesters; nil for professors.
    public let me: RankingMe?
    /// Active students ranked (zero counts included).
    public let totalRanked: Int

    public init(by: RankingBy, window: RankingWindow, top: [RankingRow], me: RankingMe?, totalRanked: Int) {
        self.by = by
        self.window = window
        self.top = top
        self.me = me
        self.totalRanked = totalRanked
    }

    /// Gradient-bar fill for a count, scaled to the leader (0 when the
    /// leader has none — empty bars, never division by zero).
    public func barFraction(count: Int) -> Double {
        guard let leader = top.first?.count, leader > 0 else { return 0 }
        return min(1, max(0, Double(count) / Double(leader)))
    }

    /// True when the requester is ranked but below the top-10 cut — the
    /// "own row still shown" story (spec 013, story 16).
    public var meOutsideTop: Bool {
        guard let me else { return false }
        return !top.contains { $0.isMe && $0.position == me.position }
    }
}

/// PT-BR display helpers for the ranking screens (UI copy only).
public enum RankingsFormatters {
    /// "17 aulas" / "1 aula" / "5 eventos" / "1 evento".
    public static func countLabelPTBR(count: Int, by: RankingBy) -> String {
        switch by {
        case .lessons: count == 1 ? "1 aula" : "\(count) aulas"
        case .events: count == 1 ? "1 evento" : "\(count) eventos"
        }
    }

    /// "2º" — position ordinal.
    public static func positionOrdinalPTBR(_ position: Int) -> String {
        "\(position)º"
    }

    /// Month window label "2026-08" → "Agosto" (capitalized, pt-BR);
    /// falls back to the raw label on malformed input.
    public static func monthNamePTBR(windowLabel: String) -> String {
        let parts = windowLabel.split(separator: "-")
        guard parts.count == 2, let month = Int(parts[1]), (1...12).contains(month) else {
            return windowLabel
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        let name = formatter.monthSymbols[month - 1]
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    /// Aluno home card line: "Você está em 2º em presença — continue assim"
    /// (aluno-03 copy); invitation fallback while unranked.
    public static func homeCardLinePTBR(me: RankingMe?) -> String {
        guard let me else {
            return "Veja quem mais treinou na academia neste mês"
        }
        return "Você está em \(positionOrdinalPTBR(me.position)) em presença — continue assim"
    }
}
