// PT-BR copy for the attendance slice (UI copy only; code stays English).
// Error mapping branches on stable problem+json codes — never on human text
// (ticket 02 doctrine, extended to the spec-004 codes).

import TatameCore

public enum AttendanceMessages {
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    public static let codeInvalid = "Código inválido ou expirado. Confira o código com o professor."
    public static let notEnrolled = "Você não está matriculado nesta turma."
    public static let noSessionToday = "Esta turma não tem aula hoje."
    public static let outsideWindow = "Fora da janela de check-in desta aula. Fale com o professor."
    public static let revokeWindowClosed =
        "O dia desta chamada já passou — correções agora são feitas pelo admin."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."
    public static let classNotFound = "Turma não encontrada."

    /// Maps the typed ApiError to PT-BR copy on stable codes only.
    public static func message(for error: ApiError) -> String {
        switch error {
        case .notFound(let code) where code == ApiErrorCode.checkinCodeInvalid:
            codeInvalid
        case .conflict(let code) where code == ApiErrorCode.checkinCodeInvalid:
            codeInvalid
        case .forbidden(let code) where code == ApiErrorCode.checkinNotEnrolled:
            notEnrolled
        case .conflict(let code) where code == ApiErrorCode.checkinNoSessionToday:
            noSessionToday
        case .conflict(let code) where code == ApiErrorCode.checkinOutsideWindow:
            outsideWindow
        case .forbidden(let code) where code == ApiErrorCode.revokeWindowClosed:
            revokeWindowClosed
        case .forbidden(let code) where code == ApiErrorCode.tenantReadOnly:
            readOnly
        case .notFound:
            classNotFound
        case .network:
            offline
        default:
            generic
        }
    }
}
