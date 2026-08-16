// PT-BR copy for the rankings slice (UI copy only; code stays English).
// The persona-dependent header/footnote copy lives here so both shells and
// the tests read one source of truth.

import TatameCore

public enum RankingsMessages {
    public static let loadFailed = "Não foi possível carregar o ranking. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."

    /// Screen title: aluno-06/07 vs professor-05/06.
    public static func titlePTBR(persona: RankingPersona) -> String {
        switch persona {
        case .aluno: "Ranking do mês"
        case .professor: "Ranking de presença"
        }
    }

    /// Header subtitle per segment. Lessons: "<Mês> · <academia>" (falling
    /// back to the aluno-06 generic when the session has no academy name);
    /// events: the aluno-07/professor-06 semester line. The professor-05
    /// "todas as suas turmas" copy is deliberately not reproduced: the
    /// endpoint is academy-wide (spec 013, story 20), so the subtitle says
    /// what the data is.
    public static func subtitlePTBR(by: RankingBy, windowLabel: String, academyName: String?) -> String {
        switch by {
        case .lessons:
            "\(RankingsFormatters.monthNamePTBR(windowLabel: windowLabel)) · \(academyName ?? "sua academia")"
        case .events:
            "Participações em eventos no semestre"
        }
    }

    /// Selos footnote (static copy — badge computation is not a v1
    /// feature). Aluno keeps the combined aluno-06/07 line on both
    /// segments; the professor gets per-segment copy — professor-05's
    /// Constância line on Por aulas and the equivalent Espírito de equipe
    /// line on Por eventos (fixing the professor-06 prototype, which
    /// repeats the aulas footnote on the eventos segment).
    public static func footnotePTBR(persona: RankingPersona, by: RankingBy) -> String {
        switch persona {
        case .aluno:
            return "12+ aulas no mês valem o selo Constância; presença em eventos vale o selo Espírito de equipe."
        case .professor:
            switch by {
            case .lessons:
                return "Alunos com 12+ aulas no mês ganham o selo Constância no app — parte da gamificação da academia."
            case .events:
                return "Presença em eventos ganha o selo Espírito de equipe no app — parte da gamificação da academia."
            }
        }
    }

    /// The selo names highlighted in pink inside the footnote.
    public static let seloNames = ["Constância", "Espírito de equipe"]
}
