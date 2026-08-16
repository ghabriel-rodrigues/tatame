// The Por aulas / Por eventos pill control (aluno-06/07, professor-05/06):
// sunken track, white pill on the selected segment with ink-purple label.

import DesignSystem
import SwiftUI
import TatameCore

struct RankingSegmentedControl: View {
    let selection: RankingBy
    let onSelect: (RankingBy) -> Void

    var body: some View {
        HStack(spacing: 0) {
            segment(.lessons, label: "Por aulas")
            segment(.events, label: "Por eventos")
        }
        .padding(LumiraTokens.Space.s1)
        .background(ThemedColors.bgSunken)
        .clipShape(Capsule())
    }

    private func segment(_ by: RankingBy, label: String) -> some View {
        Button {
            onSelect(by)
        } label: {
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(selection == by ? ThemedColors.inkPurple : ThemedColors.fg4)
                .frame(maxWidth: .infinity)
                .frame(height: 32)
                .background(selection == by ? ThemedColors.bgSurface : .clear)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("ranking-segment-\(by.rawValue)")
    }
}
