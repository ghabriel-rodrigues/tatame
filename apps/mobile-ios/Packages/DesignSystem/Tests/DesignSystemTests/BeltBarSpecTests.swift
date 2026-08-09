// BeltBar rendering rules (spec 005 testing decisions: stripe count,
// black-dan red tip, red-belt no stripes, gray fallback) — pure helpers,
// no view instantiation.

import SwiftUI
import Testing
@testable import DesignSystem

@Suite("BeltBarSpec (belt anatomy rules)")
struct BeltBarSpecTests {
    @Test("every shipped belt token slug resolves without fallback")
    func knownSlugs() {
        let slugs = [
            "belt.white", "belt.gray", "belt.yellow", "belt.orange", "belt.green",
            "belt.blue", "belt.purple", "belt.brown", "belt.black", "belt.red",
        ]
        for slug in slugs {
            #expect(BeltBarSpec.isKnown(colorSlug: slug), "missing token for \(slug)")
        }
    }

    @Test("an unknown colorSlug falls back to the gray belt token")
    func grayFallback() {
        #expect(!BeltBarSpec.isKnown(colorSlug: "belt.coral"))
        #expect(BeltBarSpec.fill(colorSlug: "belt.coral") == LumiraTokens.Colors.beltGray)
        // Bare names are not the contract — the API sends token slugs.
        #expect(!BeltBarSpec.isKnown(colorSlug: "blue"))
    }

    @Test("ponteira defaults to belt.tip and honors the black-belt red override")
    func tipResolution() {
        #expect(BeltBarSpec.tipFill(tipColorSlug: nil) == LumiraTokens.Colors.beltTip)
        #expect(BeltBarSpec.tipFill(tipColorSlug: "belt.red") == LumiraTokens.Colors.beltRed)
        // Unknown tip slug degrades like the bar: gray, never a crash.
        #expect(BeltBarSpec.tipFill(tipColorSlug: "belt.coral") == LumiraTokens.Colors.beltGray)
    }

    @Test("stripe count equals current degrees clamped into the belt maximum")
    func stripeClamping() {
        #expect(BeltBarSpec.stripeCount(degrees: 2, maxDegrees: 4) == 2)
        #expect(BeltBarSpec.stripeCount(degrees: 0, maxDegrees: 4) == 0)
        #expect(BeltBarSpec.stripeCount(degrees: 7, maxDegrees: 4) == 4)
        #expect(BeltBarSpec.stripeCount(degrees: -1, maxDegrees: 4) == 0)
        // Black-belt dans: white stripes on the red tip, up to 6 in v1.
        #expect(BeltBarSpec.stripeCount(degrees: 2, maxDegrees: 6) == 2)
    }

    @Test("red belt (maxDegrees 0) renders no degree stripes")
    func redBeltNoStripes() {
        #expect(BeltBarSpec.stripeCount(degrees: 3, maxDegrees: 0) == 0)
    }
}
