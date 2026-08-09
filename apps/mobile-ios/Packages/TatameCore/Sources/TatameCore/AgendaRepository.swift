// Repository seam for the agenda slice (spec 007, AGD.9-10). Same convention
// as AttendanceRepository: protocol in TatameCore, implementation in
// TatameAPI, features depend only on this protocol and throw `ApiError`.
// Reads only — this slice has no write surface by design (read purity,
// spec 007 story 30).

import Foundation

public protocol AgendaRepository: Sendable {
    /// GET /aluno/agenda?weekday=0..6 — enrolled classes for that weekday +
    /// today check-in state + `events: []`. Nil weekday = today in the
    /// tenant timezone (server-side default).
    func alunoAgenda(weekday: Int?) async throws -> AlunoAgenda

    /// GET /aluno/calendar?month=YYYY-MM — enrolled-class recurrence
    /// buckets + `events: []`.
    func alunoCalendar(month: String?) async throws -> PersonaCalendar

    /// GET /professor/calendar?month=YYYY-MM — own-class recurrence
    /// buckets + `events: []`.
    func professorCalendar(month: String?) async throws -> PersonaCalendar
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedAgendaRepository: AgendaRepository {
    public init() {}

    public func alunoAgenda(weekday _: Int?) async throws -> AlunoAgenda {
        fatalError("AgendaRepository not injected")
    }

    public func alunoCalendar(month _: String?) async throws -> PersonaCalendar {
        fatalError("AgendaRepository not injected")
    }

    public func professorCalendar(month _: String?) async throws -> PersonaCalendar {
        fatalError("AgendaRepository not injected")
    }
}
