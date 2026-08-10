// PT-BR copy for the events slice (UI copy only; code stays English).
// Error mapping branches on stable problem+json codes — never on human text
// (ticket 02 doctrine, extended to the spec-008 event.* codes).

import TatameCore

public enum EventsMessages {
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    public static let eventNotFound = "Evento não encontrado."
    public static let notPublished = "Este evento não está mais disponível."
    public static let registrationSettled =
        "Inscrição paga não pode ser cancelada pelo app — fale com a academia."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."

    /// "Presença confirmada — até lá!" (spec 008 fixed copy, aluno-10).
    public static let confirmed = "Presença confirmada — até lá!"
    public static let pendingPayment = "Inscrição aguardando pagamento."

    /// Maps the typed ApiError to PT-BR copy on stable codes only.
    public static func message(for error: ApiError) -> String {
        switch error {
        case .conflict(let code) where code == ApiErrorCode.eventNotPublished:
            notPublished
        case .notFound(let code) where code == ApiErrorCode.eventNotPublished:
            notPublished
        case .conflict(let code) where code == ApiErrorCode.eventRegistrationSettled:
            registrationSettled
        case .forbidden(let code) where code == ApiErrorCode.eventRegistrationSettled:
            registrationSettled
        case .forbidden(let code) where code == ApiErrorCode.tenantReadOnly:
            readOnly
        case .notFound:
            eventNotFound
        case .network:
            offline
        default:
            generic
        }
    }
}
