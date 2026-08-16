// Meus pedidos (spec 009, STO.15 — stories 27-28): own orders newest first
// — "#NNNN · produto", monogram tile, "Tam M · N un · R$ X", "Feito em
// dd/MM", the PT-BR status chip (Aguardando pagamento / Recebido / Em
// andamento / Entregue / Cancelado) — with the retirada note while there is
// something to pick up (paid/ready), "Pagar" resuming the SAME open charge
// through the existing Pix sheet on pending orders, and the pending-only
// cancel. Entry point: the vitrine header (decision documented there).
// PT-BR copy; Lumira tokens only.

import BillingFeature
import DesignSystem
import SwiftUI
import TatameCore

public struct StoreOrdersView: View {
    @State private var model: StoreOrdersModel
    private let repository: any StoreRepository

    public init(repository: any StoreRepository) {
        _model = State(initialValue: StoreOrdersModel(repository: repository))
        self.repository = repository
    }

    public var body: some View {
        StoreOrdersContent(model: model, repository: repository)
    }
}

struct StoreOrdersContent: View {
    @Bindable var model: StoreOrdersModel
    let repository: any StoreRepository

    @Environment(\.dismiss) private var dismiss
    @Environment(\.billingRepository) private var billingRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header
                if let error = model.actionError {
                    StoreErrorBanner(message: error, identifier: "orders-action-error")
                }
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    StoreErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let orders):
                    if orders.isEmpty {
                        StoreEmptyCard(
                            title: StoreMessages.emptyOrders,
                            caption: StoreMessages.emptyOrdersCaption,
                            identifier: "orders-empty"
                        )
                    } else {
                        ForEach(orders) { order in
                            orderCard(order)
                        }
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.top, LumiraTokens.Space.s4)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .storeNavigationBarHiddenOnIOS()
        .sheet(item: $model.pixTarget) { target in
            pixSheet(target)
                .presentationDetents([.medium, .large])
        }
    }

    private var header: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg2)
                    .frame(width: 34, height: 34)
                    .background(ThemedColors.bgSurface)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(ThemedColors.border1, lineWidth: 1))
            }
            .accessibilityIdentifier("orders-back-button")
            Text("Meus pedidos")
                .font(.quicksand(size: LumiraTokens.FontSize.textMd, weight: .bold))
                .foregroundStyle(ThemedColors.fg1)
            Spacer()
        }
    }

    // MARK: Order card

    private func orderCard(_ order: StoreOrder) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack(spacing: LumiraTokens.Space.s2) {
                Text(StoreFormatters.orderTitlePTBR(order: order))
                    .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg1)
                    .lineLimit(1)
                Spacer(minLength: LumiraTokens.Space.s2)
                StoreStatusChip(status: order.status)
            }

            HStack(spacing: LumiraTokens.Space.s3) {
                if let item = order.item {
                    StoreMonogramTile(
                        monogram: item.monogram,
                        gradientPreset: item.gradientPreset,
                        monogramSize: LumiraTokens.FontSize.textXs,
                        cornerRadius: LumiraTokens.Radius.sm
                    )
                    .frame(width: 46, height: 46)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(StoreFormatters.orderItemLinePTBR(order: order))
                        .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                        .foregroundStyle(ThemedColors.fg2)
                        .lineLimit(1)
                    Text(StoreFormatters.orderDateLinePTBR(createdAt: order.createdAt))
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                        .foregroundStyle(ThemedColors.fg4)
                }
                Spacer()
            }

            if order.showsPickupNote {
                HStack(spacing: LumiraTokens.Space.s1) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: LumiraTokens.FontSize.text2xs))
                        .foregroundStyle(ThemedColors.inkPurple)
                    Text(order.pickupNote)
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                        .foregroundStyle(ThemedColors.fg3)
                }
                .accessibilityIdentifier("order-pickup-note")
            }

            if order.isAwaitingPayment, order.chargeId != nil {
                Button {
                    model.pay(order)
                } label: {
                    Text("Pagar")
                        .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                        .foregroundStyle(ThemedColors.fgOnColor)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(ThemedColors.purple700)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("order-pagar-button")
            }
            if order.isCancelable {
                Button {
                    Task { await model.cancel(order) }
                } label: {
                    Text("Cancelar pedido")
                        .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                        .foregroundStyle(ThemedColors.danger500)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                }
                .disabled(model.working)
                .accessibilityIdentifier("order-cancelar-button")
            }
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("order-\(order.id.uuidString.lowercased())")
    }

    // MARK: Pix sheet (resume the SAME open charge, spec 009)

    private func pixSheet(_ target: StoreOrdersModel.PixTarget) -> some View {
        PixSheet(
            model: PaymentFlowModel(
                orderCharge: .storeOrder(chargeId: target.chargeId, amountCents: target.amountCents),
                repository: billingRepository,
                createOrderPayment: { [repository] in
                    try await repository.payOrderCharge(chargeId: target.chargeId)
                },
                onSettled: { [weak model] in
                    Task { await model?.paymentSettled() }
                }
            ),
            subtitle: StoreFormatters.pedidoPTBR(number: target.orderNumber, productName: target.productName),
            successTitle: "Pedido pago",
            successCaption: StoreMessages.orderPaid
        )
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 96)
            }
        }
        .redacted(reason: .placeholder)
    }
}
