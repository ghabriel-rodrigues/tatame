// Small shared pieces for the agenda screens (Lumira tokens only) —
// agenda-local twins where cosmetic (targets don't share internals).

import DesignSystem
import SwiftUI

/// Load-failure banner with retry (twin of the attendance one).
struct AgendaErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Tentar novamente", action: retry)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.inkPurple)
        }
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
    }
}

extension View {
    /// The handoff headers replace the system bar on iOS; the macOS floor
    /// (test-only host) has no hiding API.
    @ViewBuilder
    func agendaNavigationBarHiddenOnIOS() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }
}
