// Splash (handoff aluno-01): purple gradient, glass belt badge, brand name,
// tagline. Auto-advances after ~1.9s (prototype timing) via `onFinished`.

import DesignSystem
import SwiftUI
import TatameCore

public struct SplashView: View {
    /// Prototype auto-advance timing.
    public static let displayDuration: Duration = .milliseconds(1900)

    private let onFinished: @MainActor () -> Void

    public init(onFinished: @escaping @MainActor () -> Void) {
        self.onFinished = onFinished
    }

    public var body: some View {
        ZStack {
            // Static Lumira scale on purpose: the splash renders before any
            // tenant theme is known (handoff aluno-01 deep→vibrant purple).
            LinearGradient(
                colors: [
                    LumiraTokens.Colors.purple950,
                    LumiraTokens.Colors.purple800,
                    LumiraTokens.Colors.purple600,
                    LumiraTokens.Colors.purple500,
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: LumiraTokens.Space.s3) {
                BrandBadge(style: .glass, size: 64)
                    .padding(.bottom, LumiraTokens.Space.s2)
                Text("Tatame")
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                Text("Gestão para escolas de Jiu-Jitsu")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .medium, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor.opacity(0.72))
            }
            .offset(y: -LumiraTokens.Space.s6)
        }
        .task {
            try? await Task.sleep(for: Self.displayDuration)
            onFinished()
        }
    }
}

#Preview {
    SplashView(onFinished: {})
}
