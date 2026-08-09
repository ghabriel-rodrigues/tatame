// PT-BR copy for the graduation slice (UI copy only; code stays English).
// Error mapping branches on stable problem+json codes — never on human text
// (ticket 02 doctrine, extended to the spec-005 codes).

import TatameCore

public enum GraduationMessages {
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    public static let studentNotFound = "Aluno não encontrado."
    public static let degreeAtMax = "O aluno já está no grau máximo desta faixa."
    public static let beltInvalidTarget = "Faixa de destino inválida ou desativada pela academia."
    public static let awardPermissionDisabled =
        "A academia desativou a atualização de graduações para professores."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."
    public static let certificatePlaceholder = "Certificados chegam em uma próxima fase."

    /// Maps the typed ApiError to PT-BR copy on stable codes only. Branches
    /// on `error.code` (not the HTTP shape) so 409/422 packaging changes on
    /// the backend never break the copy.
    public static func message(for error: ApiError, notFound: String = studentNotFound) -> String {
        switch error.code {
        case ApiErrorCode.graduationDegreeAtMax:
            return degreeAtMax
        case ApiErrorCode.graduationBeltInvalidTarget:
            return beltInvalidTarget
        case ApiErrorCode.permissionDisabled:
            return awardPermissionDisabled
        case ApiErrorCode.tenantReadOnly:
            return readOnly
        default:
            break
        }
        switch error {
        case .notFound:
            return notFound
        case .network:
            return offline
        default:
            return generic
        }
    }
}
