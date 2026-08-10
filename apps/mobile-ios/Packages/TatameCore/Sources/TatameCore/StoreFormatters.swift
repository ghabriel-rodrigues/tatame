// PT-BR display helpers for the store slice (UI copy only — code stays
// English, per the charter). Mirrors the handoff labels: "#2431",
// "Comprar com Pix · R$ 389,00", "Foto 1 de 3", "12 em estoque · retirada
// na recepção da academia", the order-status chips and the Pix sheet's
// "Pedido #2431 · Kimono oficial" subtitle. Amounts are integer cents.

import Foundation

public enum StoreFormatters {
    /// "#2431" from the per-tenant sequential order number.
    public static func orderNumber(_ number: Int) -> String {
        "#\(number)"
    }

    /// The detail CTA: "Comprar com Pix · R$ 389,00" (price × quantity).
    public static func buyButtonPTBR(totalCents: Int) -> String {
        "Comprar com Pix · \(BillingFormatters.amountBRL(totalCents))"
    }

    /// Pix sheet subtitle: "Pedido #2431 · Kimono oficial Horizonte".
    public static func pedidoPTBR(number: Int, productName: String) -> String {
        "Pedido \(orderNumber(number)) · \(productName)"
    }

    /// Gallery indicator: "Foto 1 de 3" (1-based).
    public static func fotoIndicatorPTBR(index: Int, count: Int) -> String {
        "Foto \(index + 1) de \(count)"
    }

    /// Stock line under the stepper: "12 em estoque · retirada na recepção
    /// da academia" / "Esgotado · retirada na recepção da academia".
    public static func stockLinePTBR(stockQty: Int) -> String {
        let stock = stockQty > 0 ? "\(stockQty) em estoque" : "Esgotado"
        return "\(stock) · retirada na recepção da academia"
    }

    /// Order-status chip labels (spec 009 fixed copy; `pending` is the
    /// buyer-side "Aguardando pagamento").
    public static func statusLabelPTBR(_ status: StoreOrderStatus) -> String {
        switch status {
        case .pending: "Aguardando pagamento"
        case .paid: "Recebido"
        case .ready: "Em andamento"
        case .delivered: "Entregue"
        case .canceled: "Cancelado"
        }
    }

    /// Meus pedidos card title: "#2431 · Kimono oficial Horizonte".
    public static func orderTitlePTBR(order: StoreOrder) -> String {
        guard let item = order.item else { return orderNumber(order.number) }
        return "\(orderNumber(order.number)) · \(item.productName)"
    }

    /// Meus pedidos item line: "Tam M · 2 un · R$ 778,00" (size part
    /// dropped on sizeless products).
    public static func orderItemLinePTBR(order: StoreOrder) -> String {
        let total = BillingFormatters.amountBRL(order.totalCents)
        guard let item = order.item else { return total }
        let quantity = "\(item.quantity) un"
        guard let size = item.size else { return "\(quantity) · \(total)" }
        return "Tam \(size) · \(quantity) · \(total)"
    }

    /// "#tag" chip label.
    public static func tagChipPTBR(_ tag: String) -> String {
        tag.hasPrefix("#") ? tag : "#\(tag)"
    }

    /// Meus pedidos card date line: "Feito em 08/08" (UTC, same convention
    /// as the billing date helpers).
    public static func orderDateLinePTBR(createdAt: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "pt_BR")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "dd/MM"
        return "Feito em \(formatter.string(from: createdAt))"
    }
}
