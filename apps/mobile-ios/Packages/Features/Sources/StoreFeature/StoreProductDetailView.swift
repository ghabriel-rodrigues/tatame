// Product detail (handoff aluno-17/professor-14, spec 009 STO.14-15):
// full-bleed gradient banner with the monogram, back chevron, category chip
// and the "Foto N de 3" indicator; 3 thumbnail variants switching the banner
// (deterministic catalog-neighbor derivation — gallery is derivation, not
// schema); name + price, description, #tag chips; size pills (required iff
// the product has sizes), quantity stepper capped at stock, the "N em
// estoque · retirada na recepção da academia" line and "Comprar com Pix ·
// R$ X" → POST /store/orders → the EXISTING Pix sheet + simulate rails
// addressed "Pedido #NNNN · <produto>" → "Pedido pago — retire na recepção
// da academia." professor-14's "desconto de equipe" line is dropped per
// spec (no discount engine — recorded). PT-BR copy; Lumira tokens only.

import BillingFeature
import DesignSystem
import SwiftUI
import TatameCore

public struct StoreProductDetailView: View {
    @State private var model: StoreProductDetailModel
    private let repository: any StoreRepository

    public init(productId: UUID, repository: any StoreRepository) {
        _model = State(initialValue: StoreProductDetailModel(productId: productId, repository: repository))
        self.repository = repository
    }

    public var body: some View {
        StoreProductDetailContent(model: model, repository: repository)
    }
}

struct StoreProductDetailContent: View {
    @Bindable var model: StoreProductDetailModel
    let repository: any StoreRepository

    @Environment(\.dismiss) private var dismiss
    @Environment(\.tatameTheme) private var theme
    @Environment(\.billingRepository) private var billingRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                banner
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                    switch model.phase {
                    case .idle, .loading:
                        loadingState
                    case .failed(let message):
                        StoreErrorBanner(message: message) {
                            Task { await model.load() }
                        }
                    case .loaded(let detail):
                        gallery(detail)
                        titleRow(detail)
                        if let description = detail.description {
                            Text(description)
                                .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                                .foregroundStyle(ThemedColors.fg3)
                                .accessibilityIdentifier("product-description")
                        }
                        if !detail.tags.isEmpty {
                            tagChips(detail)
                        }
                        if model.orderPaid {
                            paidBanner
                        }
                        if let purchase = model.purchase {
                            purchaseSection(detail: detail, purchase: purchase)
                        }
                    }
                }
                .padding(.horizontal, LumiraTokens.Space.s6)
            }
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

    // MARK: Banner (gradient variant + monogram + category chip + Foto N de 3)

    private var gallerySlugs: [String] {
        StoreGradients.gallerySlugs(for: model.detail?.gradientPreset)
    }

    private var banner: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.fgOnColor)
                        .frame(width: 38, height: 38)
                        .background(ThemedColors.white.opacity(0.18))
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("product-back-button")
                Spacer()
                if let categoryName = model.detail?.categoryName {
                    Text(categoryName)
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                        .foregroundStyle(ThemedColors.inkPurple)
                        .padding(.horizontal, LumiraTokens.Space.s2)
                        .padding(.vertical, LumiraTokens.Space.s1)
                        .background(ThemedColors.white)
                        .clipShape(Capsule())
                        .accessibilityIdentifier("product-category-pill")
                }
            }

            if let detail = model.detail {
                Text(detail.monogram)
                    .font(.quicksand(size: 34, weight: .bold))
                    .tracking(6)
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, LumiraTokens.Space.s6)
                    .accessibilityIdentifier("product-monogram")
            } else {
                Spacer(minLength: LumiraTokens.Space.s10)
            }

            HStack {
                Spacer()
                Text(StoreFormatters.fotoIndicatorPTBR(index: model.galleryIndex, count: gallerySlugs.count))
                    .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .padding(.horizontal, LumiraTokens.Space.s2)
                    .padding(.vertical, LumiraTokens.Space.s1)
                    .background(ThemedColors.inkPurple.opacity(0.55))
                    .clipShape(Capsule())
                    .accessibilityIdentifier("gallery-indicator")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s5)
        .padding(.top, LumiraTokens.Space.s6)
        .frame(minHeight: 200, alignment: .bottomLeading)
        .background(
            LinearGradient(
                colors: StoreGradients.colors(
                    theme: theme,
                    slug: gallerySlugs.indices.contains(model.galleryIndex)
                        ? gallerySlugs[model.galleryIndex]
                        : model.detail?.gradientPreset
                ),
                startPoint: .bottomLeading,
                endPoint: .topTrailing
            )
        )
        .clipShape(
            .rect(
                bottomLeadingRadius: LumiraTokens.Radius.lg,
                bottomTrailingRadius: LumiraTokens.Radius.lg
            )
        )
        .ignoresSafeArea(edges: .top)
        .accessibilityIdentifier("product-banner")
    }

    // MARK: Gallery thumbnails (3 deterministic monogram-tile variants)

    private func gallery(_ detail: StoreProductDetail) -> some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            ForEach(Array(gallerySlugs.enumerated()), id: \.offset) { index, slug in
                Button {
                    model.galleryIndex = index
                } label: {
                    StoreMonogramTile(
                        monogram: detail.monogram,
                        gradientPreset: slug,
                        monogramSize: LumiraTokens.FontSize.text2xs,
                        cornerRadius: LumiraTokens.Radius.sm
                    )
                    .frame(width: 40, height: 40)
                    .overlay(
                        RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                            .strokeBorder(
                                model.galleryIndex == index
                                    ? ThemedColors.brandAccent
                                    : Color.clear,
                                lineWidth: 2
                            )
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("gallery-thumb-\(index)")
                .accessibilityAddTraits(model.galleryIndex == index ? .isSelected : [])
            }
        }
    }

    // MARK: Name + price / #tags

    private func titleRow(_ detail: StoreProductDetail) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: LumiraTokens.Space.s3) {
            Text(detail.name)
                .font(.quicksand(size: LumiraTokens.FontSize.textLg, weight: .bold))
                .foregroundStyle(ThemedColors.fg1)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("product-name")
            Spacer(minLength: LumiraTokens.Space.s2)
            Text(BillingFormatters.amountBRL(detail.priceCents))
                .font(.quicksand(size: LumiraTokens.FontSize.textMd, weight: .bold))
                .foregroundStyle(ThemedColors.inkPurple)
                .accessibilityIdentifier("product-price")
        }
    }

    private func tagChips(_ detail: StoreProductDetail) -> some View {
        FlowTagChips(tags: detail.tags)
    }

    // MARK: Purchase section (size pills · stepper · stock line · CTA)

    @ViewBuilder
    private func purchaseSection(detail: StoreProductDetail, purchase: StorePurchaseState) -> some View {
        if purchase.needsSize {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                Text("Tamanho")
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg2)
                HStack(spacing: LumiraTokens.Space.s2) {
                    ForEach(detail.sizes, id: \.self) { size in
                        sizePill(size)
                    }
                }
            }
        }

        if !purchase.soldOut {
            HStack {
                Text("Quantidade")
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg2)
                Spacer()
                StoreQtyStepper(
                    quantity: model.quantity,
                    canDecrement: purchase.canDecrement,
                    canIncrement: purchase.canIncrement,
                    onDecrement: { model.decrement() },
                    onIncrement: { model.increment() }
                )
            }
        }

        Text(StoreFormatters.stockLinePTBR(stockQty: detail.stockQty))
            .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
            .foregroundStyle(purchase.soldOut ? ThemedColors.danger500 : ThemedColors.fg4)
            .accessibilityIdentifier("stock-line")

        if let error = model.actionError {
            StoreErrorBanner(message: error, identifier: "buy-error-banner")
        }

        Button {
            Task { await model.buy() }
        } label: {
            Text(purchase.ctaLabelPTBR)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fgOnColor)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(
                    purchase.canBuy && !model.working
                        ? ThemedColors.purple700
                        : ThemedColors.gray300
                )
                .clipShape(Capsule())
        }
        .disabled(!purchase.canBuy || model.working)
        .accessibilityIdentifier("comprar-pix-button")
    }

    private func sizePill(_ size: String) -> some View {
        let selected = model.selectedSize == size
        return Button {
            model.toggleSize(size)
        } label: {
            Text(size)
                .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                .foregroundStyle(selected ? ThemedColors.fgOnColor : ThemedColors.fg2)
                .frame(minWidth: 46)
                .frame(height: 34)
                .background(selected ? ThemedColors.purple700 : ThemedColors.bgSurface)
                .clipShape(Capsule())
                .overlay(
                    Capsule().strokeBorder(
                        selected ? Color.clear : ThemedColors.border1,
                        lineWidth: 1
                    )
                )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("size-\(size)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Purchase feedback (story 26 fixed copy)

    private var paidBanner: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "checkmark.circle.fill")
            Text(StoreMessages.orderPaid)
        }
        .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
        .foregroundStyle(ThemedColors.success500)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s3)
        .background(ThemedColors.success100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("order-paid-banner")
    }

    // MARK: Pix sheet (the existing billing rails, stories 25-26)

    private func pixSheet(_ target: StoreProductDetailModel.PixTarget) -> some View {
        PixSheet(
            model: PaymentFlowModel(
                // Display-only projection — billing owns the real row; only
                // the charge id reaches the store payment route.
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
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .fill(ThemedColors.bgSunken)
                .frame(height: 40)
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .fill(ThemedColors.bgSunken)
                .frame(height: 120)
        }
        .redacted(reason: .placeholder)
    }
}

/// Wrapping #tag chips (tags are short; an adaptive grid wraps cleanly).
private struct FlowTagChips: View {
    let tags: [String]

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 88), alignment: .leading)],
            alignment: .leading,
            spacing: LumiraTokens.Space.s2
        ) {
            ForEach(tags, id: \.self) { tag in
                Text(StoreFormatters.tagChipPTBR(tag))
                    .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg3)
                    .padding(.horizontal, LumiraTokens.Space.s2)
                    .padding(.vertical, LumiraTokens.Space.s1)
                    .background(ThemedColors.bgSunken)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("tag-\(tag)")
            }
        }
    }
}
