// PT-BR copy for the store slice (UI copy only; code stays English).
// Error mapping branches on stable problem+json codes — never on human text
// (ticket 02 doctrine, extended to the spec-009 store.* codes).

import TatameCore

public enum StoreMessages {
    public static let loadFailed = "Não foi possível carregar. Tente novamente."
    public static let offline = "Sem conexão com a internet. Tente novamente."
    public static let generic = "Algo deu errado. Tente novamente."

    public static let productNotFound = "Produto não encontrado."
    public static let orderNotFound = "Pedido não encontrado."
    public static let notPurchasable = "Este produto não está mais disponível na loja."
    public static let insufficientStock = "Estoque insuficiente para essa quantidade."
    public static let sizeRequired = "Escolha um tamanho para este produto."
    public static let sizeInvalid = "Tamanho indisponível para este produto."
    public static let orderNotCancelable =
        "Pedido pago não pode ser cancelado pelo app — fale com a academia."
    public static let readOnly = "Academia em modo somente leitura — alterações bloqueadas."

    /// The settled-purchase feedback (spec 009 fixed copy, story 26).
    public static let orderPaid = "Pedido pago — retire na recepção da academia."
    /// The fixed v1 pickup note (server copy mirrored for empty payloads).
    public static let pickupNote = "Retirada na recepção"
    /// Honest empty state — the vitrine never fabricates products (story 21).
    public static let emptyVitrine = "Nenhum produto encontrado."
    public static let emptyVitrineCaption = "Ajuste a busca ou o filtro de categoria."
    public static let emptyOrders = "Você ainda não fez nenhum pedido."
    public static let emptyOrdersCaption = "Suas compras na loja da academia aparecem aqui."

    /// Maps the typed ApiError to PT-BR copy on stable codes only.
    /// `notFound` carries the surface-specific 404 copy.
    public static func message(for error: ApiError, notFound: String = productNotFound) -> String {
        switch error {
        case .conflict(let code) where code == ApiErrorCode.storeInsufficientStock:
            insufficientStock
        case .conflict(let code) where code == ApiErrorCode.storeProductNotPurchasable:
            notPurchasable
        case .notFound(let code) where code == ApiErrorCode.storeProductNotPurchasable:
            notPurchasable
        case .conflict(let code) where code == ApiErrorCode.storeOrderNotCancelable:
            orderNotCancelable
        case .unknown(_, let code) where code == ApiErrorCode.storeSizeRequired:
            sizeRequired
        case .unknown(_, let code) where code == ApiErrorCode.storeSizeInvalid:
            sizeInvalid
        case .conflict(let code) where code == ApiErrorCode.storeSizeRequired:
            sizeRequired
        case .conflict(let code) where code == ApiErrorCode.storeSizeInvalid:
            sizeInvalid
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
