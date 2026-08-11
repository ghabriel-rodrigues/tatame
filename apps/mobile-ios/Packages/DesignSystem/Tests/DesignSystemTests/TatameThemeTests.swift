// TatameTheme construction tests (spec 011, CFG.16-17): the environment
// value the app injects must carry exactly the golden-fixture palette for a
// tenant brand in both modes — the session wiring can never bypass
// `derivePalette` (story 28).

import Foundation
import Testing
@testable import DesignSystem

private struct FixtureFile: Decodable {
    let fixtures: [String: Fixture]
}

private struct Fixture: Decodable {
    let brand: Brand
    let light: [String: String]
    let dark: [String: String]

    struct Brand: Decodable {
        let deep: String
        let vibrant: String
        let accent: String
    }
}

@Suite("TatameTheme brand/mode construction")
struct TatameThemeTests {
    private func fixtures() throws -> [String: Fixture] {
        let url = try #require(
            Bundle.module.url(forResource: "palette-fixtures", withExtension: "json")
        )
        return try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: url)).fixtures
    }

    @Test("theme built from a tenant brand carries the golden palette", arguments: PaletteMode.allCases)
    func brandedTheme(mode: PaletteMode) throws {
        for (preset, fixture) in try fixtures() {
            let brand = BrandInput(
                deep: fixture.brand.deep,
                vibrant: fixture.brand.vibrant,
                accent: fixture.brand.accent
            )
            let theme = TatameTheme(brand: brand, mode: mode)
            let expected = mode == .light ? fixture.light : fixture.dark
            #expect(theme.mode == mode)
            #expect(theme.palette == expected, "palette mismatch for preset \(preset) (\(mode))")
        }
    }

    @Test("default theme is the Tatame brand in light mode")
    func defaultTheme() {
        let theme = TatameTheme()
        #expect(theme.mode == .light)
        #expect(theme.palette["purple-700"] == "#4F2389")
        #expect(theme.palette["purple-500"] == "#8B3DEB")
        #expect(theme.palette["pink-500"] == "#EC5BAE")
    }

    @Test("invalid brand hex degrades to an empty overlay, statics intact")
    func invalidBrand() {
        let theme = TatameTheme(
            brand: BrandInput(deep: "#nope", vibrant: "#8B3DEB", accent: "#EC5BAE"),
            mode: .dark
        )
        #expect(theme.palette.isEmpty)
        #expect(theme.color("purple-500") == nil)
    }

    @Test("themed facade aliases static tokens where no dark override exists")
    func facadeAliases() {
        // Belts and the 500-level scales have no dark remix — the facade
        // must forward the exact static token (value equality holds).
        #expect(ThemedColors.beltBlue == LumiraTokens.Colors.beltBlue)
        #expect(ThemedColors.purple500 == LumiraTokens.Colors.purple500)
        #expect(ThemedColors.brand2 == LumiraTokens.Colors.brand2)
        #expect(ThemedColors.success500 == LumiraTokens.Colors.success500)
    }
}
