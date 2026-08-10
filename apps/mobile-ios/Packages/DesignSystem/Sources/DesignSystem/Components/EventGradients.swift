// Event banner gradient catalog (spec 008). Banners are design-system
// gradient presets resolved from the API's `bannerPreset` slug — no image
// upload in v1 (recorded debt). New presets are catalog entries here, not
// schema migrations. Mirrors packages/design-system native/lib/event-
// gradients.ts: colors come from the resolved theme's derived brand scale
// so white-label academies re-brand event banners transitively, falling
// back to static Lumira tokens.

import SwiftUI

public enum EventGradients {
    /// The purple→pink event gradient — the API's default slug.
    public static let defaultSlug = "event-purple-pink"

    /// Resolves a banner preset slug to its [start, end] gradient pair.
    /// Unknown slugs fall back to the default preset — a client never
    /// renders a blank banner because the catalog lags the server.
    public static func colors(theme: TatameTheme, slug: String?) -> [Color] {
        switch slug ?? defaultSlug {
        case "event-blue-teal":
            [LumiraTokens.Colors.info500, LumiraTokens.Colors.success500]
        case defaultSlug:
            purplePink(theme: theme)
        default:
            purplePink(theme: theme)
        }
    }

    /// brand2 → brandAccent, white-label aware (web maps brand['2'] and
    /// brand.accent for the same slug).
    private static func purplePink(theme: TatameTheme) -> [Color] {
        [
            theme.color("purple-500") ?? LumiraTokens.Colors.brand2,
            theme.color("pink-500") ?? LumiraTokens.Colors.brandAccent,
        ]
    }
}
