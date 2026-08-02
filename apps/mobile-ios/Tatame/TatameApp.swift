// Tatame app target — thin shell (ticket 01, decision 4).
//
// Steady state: @main -> auth gate -> persona-shell router (Aluno /
// Professor / Responsavel), composing repositories at the root. Until the
// auth slice lands, the root shows a token-swatch splash proving the
// DesignSystem package (LumiraTokens + DerivePalette + TatameTheme) is wired.

import AuthFeature
import DesignSystem
import SwiftUI

@main
struct TatameApp: App {
    var body: some Scene {
        WindowGroup {
            TokenSwatchSplash()
        }
    }
}

/// Temporary splash rendering Lumira token swatches: static scales, the
/// runtime-derived default brand, and the belt tokens. Replaced by the auth
/// gate when the authentication feature slice lands.
struct TokenSwatchSplash: View {
    @Environment(\.tatameTheme) private var theme

    private let derivedTokens = [
        "purple-950", "purple-800", "purple-700", "purple-600", "purple-500",
        "purple-400", "purple-300", "purple-200", "purple-100", "purple-50",
    ]
    private let beltColors: [(String, Color)] = [
        ("white", LumiraTokens.Colors.beltWhite),
        ("blue", LumiraTokens.Colors.beltBlue),
        ("purple", LumiraTokens.Colors.beltPurple),
        ("brown", LumiraTokens.Colors.beltBrown),
        ("black", LumiraTokens.Colors.beltBlack),
        ("red", LumiraTokens.Colors.beltRed),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s5) {
            Spacer()

            Text("Tatame")
                .font(.system(size: LumiraTokens.FontSize.text3xl, weight: LumiraTokens.FontWeights.bold))
                .foregroundStyle(LumiraTokens.Colors.inkPurple)
            Text("Lumira design tokens — iOS scaffold")
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: LumiraTokens.FontWeights.medium))
                .foregroundStyle(LumiraTokens.Colors.fg3)

            swatchRow(title: "brand (derived)", colors: derivedTokens.compactMap(theme.color))
            swatchRow(
                title: "pink (derived)",
                colors: ["pink-700", "pink-600", "pink-500", "pink-400", "pink-300", "pink-200", "pink-100", "pink-50"]
                    .compactMap(theme.color)
            )
            swatchRow(title: "belts (static)", colors: beltColors.map(\.1))
            swatchRow(
                title: "semantics (static)",
                colors: [
                    LumiraTokens.Colors.success500,
                    LumiraTokens.Colors.warning500,
                    LumiraTokens.Colors.danger500,
                    LumiraTokens.Colors.info500,
                ]
            )

            Spacer()
        }
        .padding(LumiraTokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgApp)
    }

    private func swatchRow(title: String, colors: [Color]) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            Text(title)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: LumiraTokens.FontWeights.semibold))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            HStack(spacing: LumiraTokens.Space.s1) {
                ForEach(Array(colors.enumerated()), id: \.offset) { _, color in
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.xs)
                        .fill(color)
                        .frame(height: 36)
                        .overlay(
                            RoundedRectangle(cornerRadius: LumiraTokens.Radius.xs)
                                .strokeBorder(LumiraTokens.Colors.beltOutline, lineWidth: 1)
                        )
                }
            }
        }
    }
}

#Preview {
    TokenSwatchSplash()
}
