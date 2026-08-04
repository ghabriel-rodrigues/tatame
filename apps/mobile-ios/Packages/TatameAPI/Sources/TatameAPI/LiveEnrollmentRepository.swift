// LiveEnrollmentRepository — the generated Client wrapped behind the
// TatameCore protocol (spec 003, ENR.24-26; same pattern as
// LiveAuthRepository). Every error is normalized into ApiError; the stable
// enrollment codes (class.full, enrollment.already_enrolled, class.archived,
// authz.permission_disabled) flow through the problem+json mapper untouched.

import Foundation
import TatameCore

struct LiveEnrollmentRepository: EnrollmentRepository {
    let client: Client

    // MARK: Professor

    func professorClasses() async throws -> [ClassSummary] {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorClassesController_list_v1(.init())
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).classes.map(ClassSummary.init(dto:))
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func professorClassDetail(classId: UUID) async throws -> ClassDetail {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorClassesController_detail_v1(
                .init(path: .init(id: classId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try ClassDetail(dto: (try ok.body.json)._class)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func addStudent(classId: UUID, studentId: UUID) async throws -> EnrollmentResult {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorClassesController_addStudent_v1(
                .init(
                    path: .init(id: classId.uuidString.lowercased()),
                    body: .json(.init(studentId: studentId.uuidString.lowercased()))
                )
            )
            switch response {
            case .created(let created):
                return try EnrollmentResult(dto: (try created.body.json).enrollment)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func removeStudent(classId: UUID, studentId: UUID) async throws -> EnrollmentResult {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorClassesController_removeStudent_v1(
                .init(
                    path: .init(
                        id: classId.uuidString.lowercased(),
                        studentId: studentId.uuidString.lowercased()
                    )
                )
            )
            switch response {
            case .ok(let ok):
                return try EnrollmentResult(dto: (try ok.body.json).enrollment)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Responsável

    func dependents() async throws -> [Dependent] {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelDependentsController_list_v1(.init())
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).dependents.map(Dependent.init(dto:))
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func dependent(id: UUID) async throws -> Dependent {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelDependentsController_get_v1(
                .init(path: .init(id: id.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try Dependent(dto: (try ok.body.json).dependent)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func classSuggestion(birthDate: String) async throws -> ClassSuggestion? {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelDependentsController_suggestion_v1(
                .init(query: .init(birthDate: birthDate))
            )
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).suggestion.map { try ClassSuggestion(dto: $0.value1) }
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func registerDependent(
        fullName: String,
        birthDate: String,
        classId: UUID?
    ) async throws -> RegisteredDependent {
        try await ApiErrorMapper.run {
            let response = try await client.ResponsavelDependentsController_register_v1(
                .init(
                    body: .json(
                        .init(
                            fullName: fullName,
                            birthDate: birthDate,
                            classId: classId?.uuidString.lowercased()
                        )
                    )
                )
            )
            switch response {
            case .created(let created):
                let body = try created.body.json
                return RegisteredDependent(
                    dependent: try Dependent(dto: body.dependent),
                    enrolled: body.enrolled
                )
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
