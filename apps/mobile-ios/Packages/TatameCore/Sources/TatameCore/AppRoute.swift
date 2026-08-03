// Role gate (AUTH.26): pure mapping from the signed-in context to the shell
// the root router renders. Client-side UX only — the server guard chain is
// the enforcement (spec 001-auth).

public enum AppRoute: Sendable, Equatable {
    /// Aluno shell; `readOnly` when the academy is delinquent.
    case aluno(readOnly: Bool)
    /// Professor shell; `readOnly` when the academy is delinquent.
    case professor(readOnly: Bool)
    /// Responsável shell; `readOnly` when the academy is delinquent.
    case responsavel(readOnly: Bool)
    /// Admin and platform roles are web-console-only on mobile.
    case webConsole
    /// Suspended academy: blocking screen (logout only).
    case suspended
}

public extension SessionContext {
    /// Shell selection on the active membership's role + academy status.
    var route: AppRoute {
        let membership = activeMembership
        switch membership.role {
        case .admin, .owner, .support, .finance:
            return .webConsole
        case .student, .professor, .guardian:
            if membership.academyStatus == .suspended {
                return .suspended
            }
            let readOnly = membership.academyStatus == .delinquent
            switch membership.role {
            case .student:
                return .aluno(readOnly: readOnly)
            case .professor:
                return .professor(readOnly: readOnly)
            default:
                return .responsavel(readOnly: readOnly)
            }
        }
    }
}
