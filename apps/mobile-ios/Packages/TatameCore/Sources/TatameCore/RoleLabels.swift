// PT-BR display labels (UI copy only — code and enums stay English, per the
// charter's language rule). Shared by the login membership chooser and the
// persona shells.

public extension MembershipRole {
    /// Handoff copy for the role name.
    var displayNamePTBR: String {
        switch self {
        case .student: "Aluno"
        case .professor: "Professor"
        case .admin: "Admin da academia"
        case .guardian: "Responsável"
        case .owner: "Plataforma — Owner"
        case .support: "Plataforma — Suporte"
        case .finance: "Plataforma — Financeiro"
        }
    }
}
