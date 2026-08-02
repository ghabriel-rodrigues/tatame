// TatameTheme — SwiftUI environment-based theme scaffold (spec 002, DS.9).
//
// SCAFFOLD ONLY: the full token-consumption contract (semantic slot shape,
// dark mapping, Quicksand fonts, glass materials) is ticket 03's scope
// (.scratch/mobile-ios/issues/03-design-tokens-consumption.md, still open).
// This type fixes only the mechanism decided so far: static Lumira tokens +
// an optional runtime white-label overlay from `derivePalette`, injected via
// a typed `@Entry` environment value.

import SwiftUI

/// The resolved theme for the current tenant: light/dark mode plus the
/// derived white-label brand scale overlaying the static Lumira tokens.
public struct TatameTheme: Sendable {
    /// Default Tatame brand (Lumira purple/pink) — matches the "roxo" preset.
    public static let defaultBrand = BrandInput(
        deep: "#4F2389",
        vibrant: "#8B3DEB",
        accent: "#EC5BAE"
    )

    public let mode: PaletteMode
    /// Derived brand scale (recipe token name -> uppercase hex).
    public let palette: DerivedPalette

    /// Build a theme for a tenant brand. Falls back to an empty overlay if
    /// the brand contains invalid hex (static tokens still render).
    public init(brand: BrandInput = Self.defaultBrand, mode: PaletteMode = .light) {
        self.mode = mode
        self.palette = (try? derivePalette(brand, mode: mode)) ?? [:]
    }

    /// Resolve a derived recipe token (e.g. "purple-500") to a SwiftUI Color.
    /// Returns nil for tokens outside the derived scale — those are static
    /// and live on `LumiraTokens`.
    public func color(_ token: String) -> Color? {
        guard let hex = palette[token] else { return nil }
        return Color(lumiraHexString: hex)
    }
}

public extension Color {
    /// "#RRGGBB" (uppercase or lowercase) -> opaque sRGB Color.
    init?(lumiraHexString hex: String) {
        let n = hex.replacingOccurrences(of: "#", with: "")
        guard n.count == 6, let int = UInt64(n, radix: 16) else { return nil }
        self.init(lumiraHex: 0xFF00_0000 | int)
    }
}

public extension EnvironmentValues {
    /// The active tenant theme. Defaults to the Tatame brand, light mode.
    @Entry var tatameTheme: TatameTheme = TatameTheme()
}
