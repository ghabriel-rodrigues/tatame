// RLS.9 — bundled Quicksand TTFs register and resolve by PostScript name.

import CoreText
import SwiftUI
import Testing

@testable import DesignSystem

@Suite struct QuicksandFontTests {
    private static let expectedNames = [
        "Quicksand-Light",
        "Quicksand-Regular",
        "Quicksand-Medium",
        "Quicksand-SemiBold",
        "Quicksand-Bold",
    ]

    @Test func bundleShipsAllFiveWeightsAndLicense() {
        let ttfs = FontLoader.bundledFontURLs
        #expect(Set(ttfs.map { $0.deletingPathExtension().lastPathComponent }) == Set(Self.expectedNames))
        #expect(FontLoader.licenseURL != nil)
    }

    @Test func registeredFontsResolveByPostScriptName() {
        FontLoader.registerFonts()
        for name in Self.expectedNames {
            let font = CTFontCreateWithName(name as CFString, 14, nil)
            let resolved = CTFontCopyPostScriptName(font) as String
            // CoreText falls back to a default font when the name is unknown,
            // so equality here proves the TTF actually registered.
            #expect(resolved == name, "expected \(name), resolved \(resolved)")
        }
    }

    @Test func weightMappingCoversTheFamily() {
        // Compile-time smoke: every mapped weight produces a Font value.
        let weights: [Font.Weight] = [.ultraLight, .thin, .light, .regular, .medium, .semibold, .bold, .heavy, .black]
        for weight in weights {
            _ = Font.quicksand(size: 14, weight: weight)
        }
    }
}
