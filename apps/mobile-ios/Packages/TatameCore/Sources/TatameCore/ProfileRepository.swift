// Repository seam for the aluno profile slice (spec 013, REP.16). Same
// convention as GraduationRepository: protocol in TatameCore, implementation
// in TatameAPI, features depend only on this protocol and throw `ApiError`.

import Foundation

public protocol ProfileRepository: Sendable {
    /// GET /aluno/profile — identificação (CPF/RG lock state), contato,
    /// endereço, contato de emergência.
    func alunoProfile() async throws -> AlunoProfile

    /// PUT /aluno/profile — partial update with per-field validation.
    /// Throws `.validation(fields:)` on 422 validation.failed and
    /// `.conflict(profile.field_locked)` on a locked CPF/RG change.
    func updateAlunoProfile(_ update: AlunoProfileUpdate) async throws -> AlunoProfile
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedProfileRepository: ProfileRepository {
    public init() {}

    public func alunoProfile() async throws -> AlunoProfile {
        fatalError("ProfileRepository not injected")
    }

    public func updateAlunoProfile(_: AlunoProfileUpdate) async throws -> AlunoProfile {
        fatalError("ProfileRepository not injected")
    }
}
