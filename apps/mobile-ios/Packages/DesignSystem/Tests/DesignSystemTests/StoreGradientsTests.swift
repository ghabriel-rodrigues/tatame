import SwiftUI
import Testing
@testable import DesignSystem

@Suite("Store gradient catalog (spec 009 — monogram tiles + gallery derivation)")
struct StoreGradientsTests {
    private let theme = TatameTheme()

    @Test("every catalog slug resolves to a two-stop gradient")
    func catalogResolves() {
        for slug in StoreGradients.catalog {
            #expect(StoreGradients.colors(theme: theme, slug: slug).count == 2)
        }
    }

    @Test("unknown and nil slugs fall back to the default preset")
    func fallback() {
        let fallback = StoreGradients.colors(theme: theme, slug: "store-not-in-catalog")
        #expect(fallback == StoreGradients.colors(theme: theme, slug: StoreGradients.defaultSlug))
        #expect(StoreGradients.colors(theme: theme, slug: nil) == fallback)
    }

    @Test("gallery is the preset plus its 2 catalog neighbors, cycling")
    func galleryDerivation() {
        #expect(
            StoreGradients.gallerySlugs(for: "store-blue-purple")
                == ["store-blue-purple", "store-teal-green", "store-orange-red"]
        )
        // Cycles past the end of the catalog.
        #expect(
            StoreGradients.gallerySlugs(for: "store-pink-purple")
                == ["store-pink-purple", "store-blue-purple", "store-teal-green"]
        )
    }

    @Test("gallery derivation is deterministic and anchors unknown slugs on the default")
    func galleryUnknown() {
        let variants = StoreGradients.gallerySlugs(for: "store-not-in-catalog")
        #expect(variants == StoreGradients.gallerySlugs(for: nil))
        #expect(variants.first == StoreGradients.defaultSlug)
        #expect(Set(variants).count == 3)
    }
}
