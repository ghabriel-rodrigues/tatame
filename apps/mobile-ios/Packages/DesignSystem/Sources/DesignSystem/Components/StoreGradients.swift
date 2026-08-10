// Store product-tile gradient catalog (spec 009). Product tiles are letter
// monograms on design-system gradient presets resolved from the API's
// `gradientPreset` slug — no image upload in v1 (recorded debt). Same
// mechanism as EventGradients (`events.banner_preset`): new presets are
// catalog entries here, not schema migrations, and colors come from the
// resolved theme so white-label academies re-brand product tiles
// transitively, falling back to static Lumira tokens.

import SwiftUI

public enum StoreGradients {
    /// The catalog, in the same cycling order the API uses at product
    /// creation (`STORE_GRADIENT_PRESETS`, apps/api store module).
    public static let catalog = [
        "store-blue-purple",
        "store-teal-green",
        "store-orange-red",
        "store-pink-purple",
    ]

    /// The blue→purple preset — first of the API's creation cycle.
    public static let defaultSlug = "store-blue-purple"

    /// Resolves a product preset slug to its [start, end] gradient pair.
    /// Unknown slugs fall back to the default preset — a client never
    /// renders a blank tile because the catalog lags the server.
    public static func colors(theme: TatameTheme, slug: String?) -> [Color] {
        switch slug ?? defaultSlug {
        case "store-teal-green":
            [LumiraTokens.Colors.info500, LumiraTokens.Colors.success500]
        case "store-orange-red":
            [LumiraTokens.Colors.warning500, LumiraTokens.Colors.danger500]
        case "store-pink-purple":
            [
                theme.color("pink-500") ?? LumiraTokens.Colors.brandAccent,
                theme.color("purple-700") ?? LumiraTokens.Colors.purple700,
            ]
        default:
            [
                LumiraTokens.Colors.info500,
                theme.color("purple-500") ?? LumiraTokens.Colors.brand2,
            ]
        }
    }

    /// The detail gallery's 3 "fotos" (spec 009: derivation, not schema):
    /// the product's own preset plus its 2 deterministic catalog neighbors,
    /// cycling. Unknown slugs anchor on the default so the gallery still
    /// renders 3 distinct variants.
    public static func gallerySlugs(for slug: String?) -> [String] {
        let anchor = catalog.firstIndex(of: slug ?? defaultSlug) ?? 0
        return (0..<3).map { catalog[(anchor + $0) % catalog.count] }
    }
}

/// The v1 product "photo": a 1–3 letter monogram centered on its gradient
/// preset (spec 009 — no image upload, recorded debt). Shared by the vitrine
/// grid, the aluno home strip, the detail gallery thumbnails and the Meus
/// pedidos item tiles so every surface renders the same tile.
public struct StoreMonogramTile: View {
    @Environment(\.tatameTheme) private var theme
    private let monogram: String
    private let gradientPreset: String?
    private let monogramSize: CGFloat
    private let cornerRadius: CGFloat

    public init(
        monogram: String,
        gradientPreset: String?,
        monogramSize: CGFloat = LumiraTokens.FontSize.textXl,
        cornerRadius: CGFloat = LumiraTokens.Radius.md
    ) {
        self.monogram = monogram
        self.gradientPreset = gradientPreset
        self.monogramSize = monogramSize
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        ZStack {
            LinearGradient(
                colors: StoreGradients.colors(theme: theme, slug: gradientPreset),
                startPoint: .bottomLeading,
                endPoint: .topTrailing
            )
            Text(monogram)
                .font(.system(size: monogramSize, weight: .bold, design: .rounded))
                .tracking(monogramSize * 0.16)
                .foregroundStyle(LumiraTokens.Colors.fgOnColor)
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
