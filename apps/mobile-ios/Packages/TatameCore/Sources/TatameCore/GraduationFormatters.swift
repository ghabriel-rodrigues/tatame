// PT-BR display helpers for the graduation slice (UI copy only — code stays
// English, per the charter). Mirrors the handoff labels: "Azul · 2 graus",
// "Faixa preta · 2º dan", "26 de 40 aulas", "Maio de 2026", "Prof. Rafael
// Nunes". Black-belt degrees read as "dan" (keyed by the token slug, never
// by the display name).

import Foundation

public enum GraduationFormatters {
    /// True when the slug is the black belt — its degrees are "dans".
    public static func isBlackBelt(colorSlug: String) -> Bool {
        colorSlug == "belt.black"
    }

    /// "2 graus" / "1 grau" / "2º dan" (black) — nil at zero degrees.
    public static func degreesLabelPTBR(degrees: Int, colorSlug: String) -> String? {
        guard degrees > 0 else { return nil }
        if isBlackBelt(colorSlug: colorSlug) {
            return "\(degrees)º dan"
        }
        return degrees == 1 ? "1 grau" : "\(degrees) graus"
    }

    /// Hero title (aluno-09): "Azul · 2 graus"; just "Azul" at zero.
    public static func heroTitlePTBR(belt: BeltView) -> String {
        guard let degrees = degreesLabelPTBR(degrees: belt.degrees, colorSlug: belt.colorSlug) else {
            return belt.name
        }
        return "\(belt.name) · \(degrees)"
    }

    /// Belt chip label (aluno-19 / professor-12): "Faixa azul · 2 graus",
    /// "Faixa preta · 2º dan", "Faixa branca" at zero degrees.
    public static func chipLabelPTBR(belt: BeltView) -> String {
        let name = "Faixa \(belt.name.lowercased())"
        guard let degrees = degreesLabelPTBR(degrees: belt.degrees, colorSlug: belt.colorSlug) else {
            return name
        }
        return "\(name) · \(degrees)"
    }

    /// Progress line: "26 de 40 aulas".
    public static func progressLinePTBR(_ progress: GraduationProgress) -> String {
        "\(progress.current) de \(progress.target) aulas"
    }

    /// Professor-11 progress caption: "38 de 40 aulas para o 3º grau" /
    /// "38 de 40 aulas para a próxima faixa".
    public static func progressCaptionPTBR(_ progress: GraduationProgress) -> String {
        let line = progressLinePTBR(progress)
        switch progress.nextMilestone.kind {
        case .degree:
            if let degree = progress.nextMilestone.degree {
                return "\(line) para o \(degree)º grau"
            }
            return "\(line) para o próximo grau"
        case .belt:
            return "\(line) para a próxima faixa"
        }
    }

    /// Timeline entry title (aluno-09): degree → "Azul · 2º grau" (black →
    /// "Preta · 2º dan"), belt → "Faixa azul", revocation → "Revogação".
    public static func timelineTitlePTBR(entry: GraduationEntry) -> String {
        switch entry.kind {
        case .degree:
            let unit = isBlackBelt(colorSlug: entry.belt.colorSlug) ? "dan" : "grau"
            return "\(entry.belt.name) · \(entry.degree)º \(unit)"
        case .belt:
            return "Faixa \(entry.belt.name.lowercased())"
        case .revocation:
            return "Revogação"
        }
    }

    /// Timeline date: "Maio de 2026" (capitalized month, pt-BR).
    public static func monthYearPTBR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.dateFormat = "MMMM 'de' yyyy"
        let raw = formatter.string(from: date)
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    /// Timeline / note author line: "Prof. Rafael Nunes".
    public static func professorLinePTBR(_ actor: GraduationActor) -> String {
        "Prof. \(actor.fullName)"
    }

    /// Note metadata line: "12 jul · Prof. Rafael" (professor-11).
    public static func noteMetaPTBR(_ note: StudentNote) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.dateFormat = "d MMM"
        let day = formatter.string(from: note.createdAt).replacingOccurrences(of: ".", with: "")
        let first = note.author.fullName.split(separator: " ").first.map(String.init) ?? note.author.fullName
        return "\(day) · Prof. \(first)"
    }
}
