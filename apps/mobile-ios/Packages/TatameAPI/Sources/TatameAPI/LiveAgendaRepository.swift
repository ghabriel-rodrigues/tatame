// LiveAgendaRepository — the generated Client wrapped behind the TatameCore
// protocol (spec 007, AGD.9-10; same pattern as LiveAttendanceRepository).
// Reads only: the agenda slice has no write surface by design. Every error
// is normalized into ApiError.

import Foundation
import TatameCore

struct LiveAgendaRepository: AgendaRepository {
    let client: Client

    func alunoAgenda(weekday: Int?) async throws -> AlunoAgenda {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoAgendaController_agendaOf_v1(
                .init(query: .init(weekday: weekday.map(Double.init)))
            )
            switch response {
            case .ok(let ok):
                return try AlunoAgenda(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func alunoCalendar(month: String?) async throws -> PersonaCalendar {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoAgendaController_calendar_v1(
                .init(query: .init(month: month))
            )
            switch response {
            case .ok(let ok):
                return try PersonaCalendar(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func professorCalendar(month: String?) async throws -> PersonaCalendar {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorCalendarController_calendar_v1(
                .init(query: .init(month: month))
            )
            switch response {
            case .ok(let ok):
                return try PersonaCalendar(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
