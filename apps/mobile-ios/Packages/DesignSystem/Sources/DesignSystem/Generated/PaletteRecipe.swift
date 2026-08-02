// GENERATED DATA FILE — do not edit by hand.
//
// Swift mirror of packages/design-system/tokens/palette-recipe.json (the
// canonical white-label derivation recipe), embedded per spec 002 ("the
// palette recipe is embedded into the native ports at token-build time so the
// recipe can never drift"). Committed copy, same convention as
// LumiraTokens.swift. On an intentional recipe change, regenerate the fixtures
// in the design-system package and update this file + the test resource copy
// of palette-fixtures.json as one reviewed diff — the golden-fixture tests
// pin this mirror byte-equal to the canonical TS executor.

/// One of the three academy brand input slots.
public enum BrandSlot: String, Sendable, Hashable {
    case deep
    case vibrant
    case accent
}

/// A single mix rule: `color-mix(in oklab, base pct%, anchor)`.
/// `anchor` is a literal hex, an input slot name ("deep"|"vibrant"|"accent"),
/// the symbolic "W" (resolved per mode), or nil (pct 100, plain copy of base).
public struct RecipeRule: Sendable {
    public let base: BrandSlot
    public let pct: Double
    public let anchor: String?

    public init(base: BrandSlot, pct: Double, anchor: String?) {
        self.base = base
        self.pct = pct
        self.anchor = anchor
    }
}

/// A recipe entry: either one rule for both modes, or mode-conditional rules.
public struct RecipeEntry: Sendable {
    public let token: String
    public let light: RecipeRule
    public let dark: RecipeRule

    init(_ token: String, _ rule: RecipeRule) {
        self.token = token
        self.light = rule
        self.dark = rule
    }

    init(_ token: String, light: RecipeRule, dark: RecipeRule) {
        self.token = token
        self.light = light
        self.dark = dark
    }
}

/// The transcription of tokens/palette-recipe.json.
public enum PaletteRecipe {
    /// Symbolic "W" anchor, resolved per mode.
    public static let anchorW: (light: String, dark: String) = ("#FFFFFF", "#241E3A")

    public static let entries: [RecipeEntry] = [
        RecipeEntry("purple-700", RecipeRule(base: .deep, pct: 100, anchor: nil)),
        RecipeEntry("purple-500", RecipeRule(base: .vibrant, pct: 100, anchor: nil)),
        RecipeEntry("pink-500", RecipeRule(base: .accent, pct: 100, anchor: nil)),
        RecipeEntry("purple-600", RecipeRule(base: .deep, pct: 50, anchor: "vibrant")),
        RecipeEntry("purple-800", RecipeRule(base: .deep, pct: 72, anchor: "#12061F")),
        RecipeEntry("purple-900", RecipeRule(base: .deep, pct: 52, anchor: "#0E0518")),
        RecipeEntry("purple-950", RecipeRule(base: .deep, pct: 34, anchor: "#0A0512")),
        RecipeEntry("purple-400", RecipeRule(base: .vibrant, pct: 72, anchor: "W")),
        RecipeEntry("purple-300", RecipeRule(base: .vibrant, pct: 46, anchor: "W")),
        RecipeEntry("purple-200", RecipeRule(base: .vibrant, pct: 27, anchor: "W")),
        RecipeEntry("purple-100", RecipeRule(base: .vibrant, pct: 14, anchor: "W")),
        RecipeEntry("purple-50", RecipeRule(base: .vibrant, pct: 6, anchor: "W")),
        RecipeEntry(
            "purple-ink",
            light: RecipeRule(base: .deep, pct: 100, anchor: nil),
            dark: RecipeRule(base: .vibrant, pct: 65, anchor: "#FFFFFF")
        ),
        RecipeEntry(
            "pink-ink",
            light: RecipeRule(base: .accent, pct: 64, anchor: "#3B0A24"),
            dark: RecipeRule(base: .accent, pct: 60, anchor: "#FFFFFF")
        ),
        RecipeEntry("pink-700", RecipeRule(base: .accent, pct: 64, anchor: "#3B0A24")),
        RecipeEntry("pink-600", RecipeRule(base: .accent, pct: 80, anchor: "#3B0A24")),
        RecipeEntry("pink-400", RecipeRule(base: .accent, pct: 72, anchor: "W")),
        RecipeEntry("pink-300", RecipeRule(base: .accent, pct: 46, anchor: "W")), // extrapolated
        RecipeEntry("pink-200", RecipeRule(base: .accent, pct: 27, anchor: "W")), // extrapolated
        RecipeEntry("pink-100", RecipeRule(base: .accent, pct: 13, anchor: "W")),
        RecipeEntry("pink-50", RecipeRule(base: .accent, pct: 6, anchor: "W")),
    ]
}
