// Quicksand — the product typeface (spec 014, RLS.9).
//
// Real Quicksand TTFs (SIL OFL 1.1, see Resources/Fonts/OFL.txt) replace the
// `.system(design: .rounded)` approximation used before ticket RLS.9. Static
// instances Light/Regular/Medium/SemiBold/Bold were generated from the
// official Google Fonts variable font (google/fonts ofl/quicksand).
//
// Registration is process-wide and lazy: the first `.quicksand(...)` access
// triggers `FontLoader.registerFonts()` (a thread-safe `static let`), so no
// app-target wiring is needed and the app shell keeps depending on Features
// only (ticket 01, decision 4). SwiftUI previews and SPM tests get the fonts
// for free the same way.

import CoreText
import SwiftUI

/// Registers the bundled Quicksand TTFs with CoreText for this process.
public enum FontLoader {
    /// Idempotent, thread-safe registration. Called implicitly by
    /// `Font.quicksand(size:weight:)`; safe to call explicitly at app launch.
    public static func registerFonts() {
        _ = registration
    }

    /// Bundled static instances (internal for the resource-integrity test —
    /// the test target's own `Bundle.module` cannot see these files).
    static var bundledFontURLs: [URL] {
        Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? []
    }

    /// SIL OFL 1.1 license shipped alongside the TTFs.
    static var licenseURL: URL? {
        Bundle.module.url(forResource: "OFL", withExtension: "txt", subdirectory: "Fonts")
    }

    /// One-shot registration (Swift guarantees `static let` runs once).
    private static let registration: Bool = {
        let urls = bundledFontURLs
        guard !urls.isEmpty else {
            assertionFailure("DesignSystem: Fonts resource folder missing")
            return false
        }
        for url in urls {
            var error: Unmanaged<CFError>?
            let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
            // kCTFontManagerErrorAlreadyRegistered (105) is fine — another
            // copy of the process (tests, previews) may have registered first.
            if !ok, let error = error?.takeRetainedValue(),
               CFErrorGetCode(error) != CTFontManagerError.alreadyRegistered.rawValue {
                assertionFailure("DesignSystem: failed to register \(url.lastPathComponent): \(error)")
            }
        }
        return true
    }()
}

extension Font {
    /// Quicksand at an exact token size (`LumiraTokens.FontSize.*`).
    ///
    /// Maps SwiftUI weights onto the five bundled static instances; weights
    /// outside the family (thin, heavy, ...) clamp to the nearest instance.
    public static func quicksand(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        FontLoader.registerFonts()
        return .custom(quicksandName(for: weight), fixedSize: size)
    }

    /// PostScript name of the static instance closest to `weight`.
    private static func quicksandName(for weight: Font.Weight) -> String {
        switch weight {
        case .ultraLight, .thin, .light: return "Quicksand-Light"
        case .regular: return "Quicksand-Regular"
        case .medium: return "Quicksand-Medium"
        case .semibold: return "Quicksand-SemiBold"
        case .bold, .heavy, .black: return "Quicksand-Bold"
        default: return "Quicksand-Regular"
        }
    }
}
