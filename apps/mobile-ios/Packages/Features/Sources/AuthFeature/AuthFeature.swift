// AuthFeature — stub target (first feature per the charter; spec pending).
//
// The real auth flow (login screens for all personas, session restoration,
// invite signup) lands with the authentication feature slice, following the
// MV @Observable conventions from ticket 06.

import SwiftUI
import TatameCore

/// Placeholder entry view for the auth flow.
public struct AuthPlaceholderView: View {
    public init() {}

    public var body: some View {
        Text("AuthFeature stub")
    }
}
