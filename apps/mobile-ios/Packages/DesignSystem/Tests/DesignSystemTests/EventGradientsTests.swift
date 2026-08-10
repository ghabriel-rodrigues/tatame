import SwiftUI
import Testing
@testable import DesignSystem

@Suite("EventGradients catalog (spec 008 banner presets)")
struct EventGradientsTests {
    private let theme = TatameTheme()

    @Test("the default slug resolves to the purple→pink brand pair")
    func defaultSlug() {
        let pair = EventGradients.colors(theme: theme, slug: "event-purple-pink")
        #expect(pair.count == 2)
        #expect(pair[0] == (theme.color("purple-500") ?? LumiraTokens.Colors.brand2))
        #expect(pair[1] == (theme.color("pink-500") ?? LumiraTokens.Colors.brandAccent))
    }

    @Test("event-blue-teal resolves info→success")
    func blueTeal() {
        let pair = EventGradients.colors(theme: theme, slug: "event-blue-teal")
        #expect(pair == [LumiraTokens.Colors.info500, LumiraTokens.Colors.success500])
    }

    @Test("nil and unknown slugs fall back to the default preset — never a blank banner")
    func fallback() {
        let fallback = EventGradients.colors(theme: theme, slug: "event-not-in-catalog")
        #expect(fallback == EventGradients.colors(theme: theme, slug: nil))
        #expect(fallback == EventGradients.colors(theme: theme, slug: EventGradients.defaultSlug))
    }
}
