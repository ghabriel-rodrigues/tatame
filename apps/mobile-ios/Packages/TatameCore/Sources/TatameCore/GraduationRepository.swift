// Repository seam for the graduation slice (spec 005, GRD.21-23). Same
// convention as AttendanceRepository: protocol in TatameCore, implementation
// in TatameAPI, features depend only on this protocol and throw `ApiError`.

import Foundation

public protocol GraduationRepository: Sendable {
    // MARK: Aluno

    /// GET /aluno/graduation — hero belt, progress, evolution timeline.
    func alunoGraduation() async throws -> AlunoGraduation

    // MARK: Professor (any student of the academy — foreign ids are 404s)

    /// GET /professor/students/:id/profile — belt, progress, stat tiles,
    /// observações.
    func studentProfile(studentId: UUID) async throws -> StudentProfile

    /// POST /professor/students/:id/graduations — Adicionar grau / Promover
    /// faixa. `beltId` is required for `.belt`. Throws
    /// `.forbidden(authz.permission_disabled)` when the admin turned the
    /// graduation.update toggle off, `graduation.degree_at_max`, and
    /// `graduation.belt_invalid_target` per the stable-code registry.
    func award(studentId: UUID, kind: AwardKind, beltId: UUID?, notes: String?) async throws -> AwardResult

    /// GET /professor/students/:id/notes — observações, newest first.
    func notes(studentId: UUID) async throws -> [StudentNote]

    /// POST /professor/students/:id/notes.
    func createNote(studentId: UUID, body: String) async throws -> StudentNote

    /// GET /professor/profile — own belt chip + graduações válidas.
    func professorProfile() async throws -> ProfessorProfile
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedGraduationRepository: GraduationRepository {
    public init() {}

    public func alunoGraduation() async throws -> AlunoGraduation {
        fatalError("GraduationRepository not injected")
    }

    public func studentProfile(studentId _: UUID) async throws -> StudentProfile {
        fatalError("GraduationRepository not injected")
    }

    public func award(
        studentId _: UUID,
        kind _: AwardKind,
        beltId _: UUID?,
        notes _: String?
    ) async throws -> AwardResult {
        fatalError("GraduationRepository not injected")
    }

    public func notes(studentId _: UUID) async throws -> [StudentNote] {
        fatalError("GraduationRepository not injected")
    }

    public func createNote(studentId _: UUID, body _: String) async throws -> StudentNote {
        fatalError("GraduationRepository not injected")
    }

    public func professorProfile() async throws -> ProfessorProfile {
        fatalError("GraduationRepository not injected")
    }
}
