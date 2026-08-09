// PT-BR copy for the billing slice (UI copy only; code stays English).
// Error mapping branches on stable problem+json codes — never on human text
// (ticket 02 doctrine, extended to the spec-006 billing.* codes).

import TatameCore

public enum BillingMessages {
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    public static let chargeNotPayable = "Esta cobrança não está mais em aberto."
    public static let methodMandateMismatch = "A recorrência só está disponível para pagamento com cartão."
    public static let mandateAlreadyActive = "A recorrência no cartão já está ativa."
    public static let simulateUnavailable = "Simulação indisponível neste ambiente."
    public static let chargeNotFound = "Cobrança não encontrada."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."

    public static let pixCopied = "Código Pix copiado."
    public static let boletoCopied = "Linha digitável copiada."

    /// Maps the typed ApiError to PT-BR copy on stable codes only.
    /// `notFound` carries the surface-specific 404 copy.
    public static func message(for error: ApiError, notFound: String = chargeNotFound) -> String {
        switch error {
        case .conflict(let code) where code == ApiErrorCode.billingChargeNotPayable:
            chargeNotPayable
        case .conflict(let code) where code == ApiErrorCode.billingMethodMandateMismatch:
            methodMandateMismatch
        case .conflict(let code) where code == ApiErrorCode.billingMandateAlreadyActive:
            mandateAlreadyActive
        case .conflict(let code) where code == ApiErrorCode.billingSimulateUnavailable:
            simulateUnavailable
        case .notFound(let code) where code == ApiErrorCode.billingSimulateUnavailable:
            simulateUnavailable
        case .forbidden(let code) where code == ApiErrorCode.tenantReadOnly:
            readOnly
        case .notFound:
            notFound
        case .network:
            offline
        default:
            generic
        }
    }
}
