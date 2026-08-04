// PT-BR copy for the enrollment slice (UI copy only; code stays English).
// Error mapping branches on stable problem+json codes — never on human text
// (ticket 02 doctrine, extended to the spec-003 codes).

import TatameCore

public enum EnrollmentMessages {
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    public static let classFull = "Turma lotada — não há vagas disponíveis."
    public static let alreadyEnrolled = "Este aluno já está na turma."
    public static let classArchived = "Esta turma foi arquivada."
    public static let classNotFound = "Turma não encontrada."
    public static let dependentNotFound = "Aluno não encontrado."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."
    public static let registerDisabled = "A academia desativou o cadastro de dependentes."

    public static let fillDependentFields = "Preencha nome e data de nascimento."
    public static let invalidBirthDate = "Data de nascimento inválida."
    public static let registeredEnrolled = "Aluno cadastrado e matriculado na turma sugerida."
    public static let registeredNotEnrolled =
        "Aluno cadastrado. Sem vaga na turma no momento — a matrícula fica para depois."

    /// Maps the typed ApiError to PT-BR copy on stable codes only.
    /// `notFound` carries the surface-specific 404 copy (turma vs dependente).
    public static func message(for error: ApiError, notFound: String = classNotFound) -> String {
        switch error {
        case .conflict(let code) where code == ApiErrorCode.classFull:
            classFull
        case .conflict(let code) where code == ApiErrorCode.alreadyEnrolled:
            alreadyEnrolled
        case .conflict(let code) where code == ApiErrorCode.classArchived:
            classArchived
        case .forbidden(let code) where code == ApiErrorCode.permissionDisabled:
            registerDisabled
        case .forbidden(let code) where code == ApiErrorCode.tenantReadOnly:
            readOnly
        case .notFound:
            notFound
        case .network:
            offline
        case .validation:
            invalidBirthDate
        default:
            generic
        }
    }
}
