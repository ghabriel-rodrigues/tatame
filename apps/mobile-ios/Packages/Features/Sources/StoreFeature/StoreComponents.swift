// Shared store chrome (spec 009, STO.14-15): the vitrine grid card, the
// order status chip, the quantity stepper, the perfil "Loja da academia"
// entry row and the small error/empty states. PT-BR copy; Lumira tokens
// only — tiles ride the DesignSystem StoreMonogramTile so white-label
// academies re-brand product tiles transitively.

import DesignSystem
import SwiftUI
import TatameCore

/// Navigation payload for pushing the product detail from the vitrine grid,
/// the aluno home strip or a Meus pedidos row.
public struct StoreProductTarget: Identifiable, Hashable, Sendable {
    public let id: UUID

    public init(id: UUID) {
        self.id = id
    }
}

// MARK: - Vitrine grid card (aluno-16 / professor-13, unclipped)

/// One card of the 2-column grid: gradient monogram tile, name, price and
/// the trailing category label. No fixed text frames — the prototype's
/// clipped grid is fixed, not reproduced.
struct StoreGridCard: View {
    let product: StoreProductCard
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                StoreMonogramTile(monogram: product.monogram, gradientPreset: product.gradientPreset)
                    .frame(height: 96)
                    .frame(maxWidth: .infinity)
                Text(product.name)
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg1)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .firstTextBaseline) {
                    Text(BillingFormatters.amountBRL(product.priceCents))
                        .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .bold))
                        .foregroundStyle(ThemedColors.inkPurple)
                    Spacer(minLength: LumiraTokens.Space.s1)
                    if let categoryName = product.categoryName {
                        Text(categoryName)
                            .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                            .foregroundStyle(ThemedColors.fg4)
                            .lineLimit(1)
                    }
                }
            }
            .padding(LumiraTokens.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.border1, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("product-\(product.id.uuidString.lowercased())")
    }
}

// MARK: - Category chip (working carousel member)

struct StoreCategoryChip: View {
    let label: String
    let selected: Bool
    let identifier: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(label)
                .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                .foregroundStyle(selected ? ThemedColors.fgOnColor : ThemedColors.fg2)
                .padding(.horizontal, LumiraTokens.Space.s3)
                .frame(height: 32)
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
        .accessibilityIdentifier(identifier)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Order status chip (PT-BR labels, spec tone mapping)

struct StoreStatusChip: View {
    let status: StoreOrderStatus

    var body: some View {
        Text(StoreFormatters.statusLabelPTBR(status))
            .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, LumiraTokens.Space.s2)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(background)
            .clipShape(Capsule())
            .accessibilityIdentifier("order-status-chip")
    }

    private var foreground: Color {
        switch status.chipTone {
        case .warning: ThemedColors.warning500
        case .success: ThemedColors.success500
        case .brand: ThemedColors.inkPurple
        case .neutral: ThemedColors.fg3
        case .danger: ThemedColors.danger500
        }
    }

    private var background: Color {
        switch status.chipTone {
        case .warning: ThemedColors.warning100
        case .success: ThemedColors.success100
        case .brand: ThemedColors.purple50
        case .neutral: ThemedColors.bgSunken
        case .danger: ThemedColors.danger100
        }
    }
}

// MARK: - Quantity stepper (aluno-17)

struct StoreQtyStepper: View {
    let quantity: Int
    let canDecrement: Bool
    let canIncrement: Bool
    let onDecrement: () -> Void
    let onIncrement: () -> Void

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            stepButton("minus", enabled: canDecrement, identifier: "qty-decrement", action: onDecrement)
            Text("\(quantity)")
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .bold))
                .foregroundStyle(ThemedColors.fg1)
                .frame(minWidth: 20)
                .accessibilityIdentifier("qty-value")
            stepButton("plus", enabled: canIncrement, identifier: "qty-increment", action: onIncrement)
        }
    }

    private func stepButton(
        _ icon: String,
        enabled: Bool,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .bold))
                .foregroundStyle(enabled ? ThemedColors.inkPurple : ThemedColors.fg4)
                .frame(width: 30, height: 30)
                .background(ThemedColors.bgSurface)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(ThemedColors.border1, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - Perfil "Loja da academia" entry row (aluno-19 / professor-12)

/// The perfil shortcut into the vitrine: aluno gets the "Novo" pill per the
/// prototype, professor the plain row (spec 009 stories 16-17 — the dead
/// entries finally work).
public struct StoreEntryRow: View {
    private let showsNovoPill: Bool
    private let onTap: () -> Void

    public init(showsNovoPill: Bool = false, onTap: @escaping () -> Void) {
        self.showsNovoPill = showsNovoPill
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: LumiraTokens.Space.s3) {
                Image(systemName: "bag")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .frame(width: 36, height: 36)
                    .background(ThemedColors.purple50)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Loja da academia")
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg1)
                    Text("Produtos oficiais · retirada na recepção")
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                        .foregroundStyle(ThemedColors.fg4)
                }
                Spacer()
                if showsNovoPill {
                    Text("Novo")
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                        .foregroundStyle(ThemedColors.fgOnColor)
                        .padding(.horizontal, LumiraTokens.Space.s2)
                        .padding(.vertical, LumiraTokens.Space.s1)
                        .background(ThemedColors.brandAccent)
                        .clipShape(Capsule())
                        .accessibilityIdentifier("loja-novo-pill")
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fg4)
            }
            .padding(LumiraTokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.border1, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("perfil-loja-row")
    }
}

// MARK: - Shared chrome

struct StoreErrorBanner: View {
    let message: String
    var identifier = "store-error-banner"
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Text(message)
                .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let retry {
                Button("Tentar novamente", action: retry)
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier(identifier)
    }
}

/// Honest empty state card (vitrine + Meus pedidos).
struct StoreEmptyCard: View {
    let title: String
    let caption: String
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            Text(title)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fg1)
            Text(caption)
                .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.fg4)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier(identifier)
    }
}

extension View {
    /// The custom store headers replace the system bar on iOS; the macOS
    /// floor (test-only host) has no hiding API.
    @ViewBuilder
    func storeNavigationBarHiddenOnIOS() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }
}
