// Canonical white-label palette derivation — Swift port (spec 002, DS.9).
//
// Line-for-line port of the math in
// packages/design-system/src/theme/derive-palette.ts, executing the recipe
// embedded in Generated/PaletteRecipe.swift. Mix semantics match CSS
// `color-mix(in oklab, c1 p%, c2)`: both colors are converted sRGB -> OKLab,
// linearly interpolated at p (weight of c1), converted back, clamped to sRGB,
// and emitted as uppercase hex.
//
// The TypeScript executor is THE single source of derived brand colors; this
// port is pinned byte-equal to it by tokens/palette-fixtures.json (golden
// fixtures asserted in DesignSystemTests).

import Foundation

/// The 3-color academy brand.
public struct BrandInput: Sendable, Hashable {
    /// Primary deep brand color (maps to purple-700).
    public let deep: String
    /// Vibrant brand color (maps to purple-500).
    public let vibrant: String
    /// Accent color (maps to pink-500).
    public let accent: String

    public init(deep: String, vibrant: String, accent: String) {
        self.deep = deep
        self.vibrant = vibrant
        self.accent = accent
    }

    subscript(slot: BrandSlot) -> String {
        switch slot {
        case .deep: deep
        case .vibrant: vibrant
        case .accent: accent
        }
    }
}

public enum PaletteMode: String, Sendable, Hashable, CaseIterable {
    case light
    case dark
}

/// Recipe token name (e.g. "purple-700", "pink-ink") -> uppercase hex.
public typealias DerivedPalette = [String: String]

public enum DerivePaletteError: Error, Equatable {
    case invalidHex(String)
}

// MARK: - sRGB <-> OKLab (Björn Ottosson's reference constants)

typealias Oklab = (l: Double, a: Double, b: Double)

private func srgbChannelToLinear(_ c: Double) -> Double {
    c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
}

private func linearChannelToSrgb(_ c: Double) -> Double {
    c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055
}

/// Expand `#RGB`/`RGB` to 6 hex digits, strip `#`. Throws on invalid input.
private func expandHex(_ hex: String) throws -> String {
    let n = hex.replacingOccurrences(of: "#", with: "")
    let full = n.count == 3 ? n.map { String($0) + String($0) }.joined() : n
    guard full.count == 6, UInt32(full, radix: 16) != nil else {
        throw DerivePaletteError.invalidHex(hex)
    }
    return full
}

func hexToOklab(_ hex: String) throws -> Oklab {
    let full = try expandHex(hex)
    let int = UInt32(full, radix: 16)! // validated by expandHex

    let r = srgbChannelToLinear(Double((int >> 16) & 0xFF) / 255)
    let g = srgbChannelToLinear(Double((int >> 8) & 0xFF) / 255)
    let b = srgbChannelToLinear(Double(int & 0xFF) / 255)

    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

    return (
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    )
}

func oklabToHex(_ lab: Oklab) -> String {
    let (L, a, b) = lab
    let l = pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
    let m = pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
    let s = pow(L - 0.0894841775 * a - 1.291485548 * b, 3)

    let channels = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ].map { lin -> Int in
        let srgb = linearChannelToSrgb(lin)
        let clamped = min(1, max(0, srgb))
        // JS Math.round: round half up — identical to away-from-zero for >= 0.
        return Int((clamped * 255).rounded(.toNearestOrAwayFromZero))
    }

    return "#" + channels.map { String(format: "%02X", $0) }.joined()
}

/// CSS `color-mix(in oklab, c1 pct%, c2)` equivalent.
/// `pct` is the weight of `c1` (0-100).
func mixOklab(_ c1: String, _ pct: Double, _ c2: String) throws -> String {
    let w = pct / 100
    let (l1, a1, b1) = try hexToOklab(c1)
    let (l2, a2, b2) = try hexToOklab(c2)
    return oklabToHex((
        l1 * w + l2 * (1 - w),
        a1 * w + a2 * (1 - w),
        b1 * w + b2 * (1 - w)
    ))
}

// MARK: - Recipe execution

/// Normalize any valid input to uppercase #RRGGBB via a round-trip-free path.
private func normalizeHex(_ hex: String) throws -> String {
    "#" + (try expandHex(hex)).uppercased()
}

private func resolveAnchor(
    _ anchor: String,
    _ input: BrandInput,
    _ mode: PaletteMode
) -> String {
    if anchor == "W" {
        return mode == .light ? PaletteRecipe.anchorW.light : PaletteRecipe.anchorW.dark
    }
    if let slot = BrandSlot(rawValue: anchor) {
        return input[slot]
    }
    return anchor
}

private func applyRule(
    _ rule: RecipeRule,
    _ input: BrandInput,
    _ mode: PaletteMode
) throws -> String {
    let base = input[rule.base]
    // Plain copy (anchor nil) skips the OKLab round trip entirely so the
    // brand inputs pass through bit-exact (only normalized to #RRGGBB upper).
    guard let anchor = rule.anchor else { return try normalizeHex(base) }
    return try mixOklab(base, rule.pct, resolveAnchor(anchor, input, mode))
}

/// Derive the full brand scale (purple-50..950, pink-50..700, purple-ink,
/// pink-ink) from a 3-color academy brand, for the given mode.
///
/// Neutrals, semantics, belts, and glass are static tokens and are NOT
/// derived — see `LumiraTokens`.
public func derivePalette(
    _ input: BrandInput,
    mode: PaletteMode
) throws -> DerivedPalette {
    var out: DerivedPalette = [:]
    for entry in PaletteRecipe.entries {
        let rule = mode == .light ? entry.light : entry.dark
        out[entry.token] = try applyRule(rule, input, mode)
    }
    return out
}
