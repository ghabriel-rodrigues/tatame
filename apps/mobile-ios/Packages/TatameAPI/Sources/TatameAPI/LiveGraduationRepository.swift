// LiveGraduationRepository — the generated Client wrapped behind the
// TatameCore protocol (spec 005, GRD.21-23; same pattern as
// LiveAttendanceRepository). Every error is normalized into ApiError; the
// stable graduation codes (graduation.degree_at_max,
// graduation.belt_invalid_target, authz.permission_disabled,
// tenant.read_only) flow through the problem+json mapper untouched.

import Foundation
import TatameCore

struct LiveGraduationRepository: GraduationRepository {
    let client: Client

    // MARK: Aluno

    func alunoGraduation() async throws -> AlunoGraduation {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoGraduationController_graduation_v1(.init())
            switch response {
            case .ok(let ok):
                return try AlunoGraduation(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Professor

    func studentProfile(studentId: UUID) async throws -> StudentProfile {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorGraduationController_studentProfile_v1(
                .init(path: .init(id: studentId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try StudentProfile(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func award(studentId: UUID, kind: AwardKind, beltId: UUID?, notes: String?) async throws -> AwardResult {
        try await ApiErrorMapper.run {
            let kindPayload: Components.Schemas.AwardGraduationDto.kindPayload =
                switch kind {
                case .degree: .degree
                case .belt: .belt
                }
            let response = try await client.ProfessorGraduationController_award_v1(
                .init(
                    path: .init(id: studentId.uuidString.lowercased()),
                    body: .json(
                        .init(
                            kind: kindPayload,
                            beltId: beltId?.uuidString.lowercased(),
                            notes: notes
                        )
                    )
                )
            )
            switch response {
            case .created(let created):
                return try AwardResult(dto: try created.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func notes(studentId: UUID) async throws -> [StudentNote] {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorGraduationController_listNotes_v1(
                .init(path: .init(id: studentId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).notes.map(StudentNote.init(dto:))
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func createNote(studentId: UUID, body: String) async throws -> StudentNote {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorGraduationController_createNote_v1(
                .init(
                    path: .init(id: studentId.uuidString.lowercased()),
                    body: .json(.init(body: body))
                )
            )
            switch response {
            case .created(let created):
                return try StudentNote(dto: (try created.body.json).note)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func professorProfile() async throws -> ProfessorProfile {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorGraduationController_profile_v1(.init())
            switch response {
            case .ok(let ok):
                return try ProfessorProfile(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
