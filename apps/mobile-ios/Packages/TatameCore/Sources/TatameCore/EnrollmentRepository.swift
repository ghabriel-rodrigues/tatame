// Repository seam for the enrollment slice (spec 003, ENR.24-26). Same
// convention as AuthRepository: protocol in TatameCore, implementation in
// TatameAPI, features depend only on this protocol and throw `ApiError`.

import Foundation

public protocol EnrollmentRepository: Sendable {
    // MARK: Professor (own classes only — foreign class ids are 404s)

    /// GET /professor/classes — the classes this professor teaches, with
    /// schedules, occupancy, and the server-derived `lotada` flag.
    func professorClasses() async throws -> [ClassSummary]

    /// GET /professor/classes/:id — detail + active roster.
    /// Throws `.notFound` for a class the professor does not teach.
    func professorClassDetail(classId: UUID) async throws -> ClassDetail

    /// POST /professor/classes/:id/students. Throws `.conflict(class.full)`,
    /// `.conflict(enrollment.already_enrolled)`, `.conflict(class.archived)`.
    func addStudent(classId: UUID, studentId: UUID) async throws -> EnrollmentResult

    /// DELETE /professor/classes/:id/students/:studentId.
    func removeStudent(classId: UUID, studentId: UUID) async throws -> EnrollmentResult

    // MARK: Responsável (own dependents only — foreign ids are 404s)

    /// GET /responsavel/dependents — children with class + next slot.
    func dependents() async throws -> [Dependent]

    /// GET /responsavel/dependents/:id.
    func dependent(id: UUID) async throws -> Dependent

    /// GET /responsavel/class-suggestion?birthDate= — nil when no active
    /// age-matching class with a free slot exists.
    func classSuggestion(birthDate: String) async throws -> ClassSuggestion?

    /// POST /responsavel/dependents — cadastrar filho with auto guardian
    /// link; enrollment into `classId` is attempted server-side and skipped
    /// when full (story 34). Throws `.forbidden(authz.permission_disabled)`
    /// when the dependents.register toggle is off.
    func registerDependent(fullName: String, birthDate: String, classId: UUID?) async throws -> RegisteredDependent
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedEnrollmentRepository: EnrollmentRepository {
    public init() {}

    public func professorClasses() async throws -> [ClassSummary] {
        fatalError("EnrollmentRepository not injected")
    }

    public func professorClassDetail(classId _: UUID) async throws -> ClassDetail {
        fatalError("EnrollmentRepository not injected")
    }

    public func addStudent(classId _: UUID, studentId _: UUID) async throws -> EnrollmentResult {
        fatalError("EnrollmentRepository not injected")
    }

    public func removeStudent(classId _: UUID, studentId _: UUID) async throws -> EnrollmentResult {
        fatalError("EnrollmentRepository not injected")
    }

    public func dependents() async throws -> [Dependent] {
        fatalError("EnrollmentRepository not injected")
    }

    public func dependent(id _: UUID) async throws -> Dependent {
        fatalError("EnrollmentRepository not injected")
    }

    public func classSuggestion(birthDate _: String) async throws -> ClassSuggestion? {
        fatalError("EnrollmentRepository not injected")
    }

    public func registerDependent(
        fullName _: String,
        birthDate _: String,
        classId _: UUID?
    ) async throws -> RegisteredDependent {
        fatalError("EnrollmentRepository not injected")
    }
}
