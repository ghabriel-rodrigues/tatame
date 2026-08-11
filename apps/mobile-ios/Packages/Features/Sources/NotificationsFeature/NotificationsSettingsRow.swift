// Perfil "Notificações" ListRow with the switch (spec 010, story 9 — the
// prototype's bell row). Wired to the settings endpoints: off = mute (the
// badge goes quiet, rows keep being written, the screen stays reachable).
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct NotificationsSettingsRow: View {
    @State private var model: NotificationsSettingsModel?
    @Environment(\.notificationsRepository) private var repository

    public init() {}

    public var body: some View {
        Group {
            if let model {
                NotificationsSettingsRowContent(model: model)
            } else {
                NotificationsSettingsRowContent(model: nil)
            }
        }
        .task {
            if model == nil {
                let created = NotificationsSettingsModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

struct NotificationsSettingsRowContent: View {
    /// Nil while the model is being created on first task-fire.
    var model: NotificationsSettingsModel?

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            HStack(spacing: LumiraTokens.Space.s3) {
                ZStack {
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                        .fill(ThemedColors.purple50)
                        .frame(width: 38, height: 38)
                    Image(systemName: "bell")
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.purple600)
                }
                Text(NotificationsMessages.settingsRow)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                Spacer()
                Toggle("", isOn: toggleBinding)
                    .labelsHidden()
                    .tint(ThemedColors.inkPurple)
                    .disabled(model?.enabled == nil || model?.saving == true)
                    .accessibilityIdentifier("notifications-settings-toggle")
            }
            if let error = model?.errorMessage {
                Text(error)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                    .foregroundStyle(ThemedColors.danger500)
            }
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("notifications-settings-row")
    }

    private var toggleBinding: Binding<Bool> {
        Binding(
            get: { model?.enabled ?? true },
            set: { newValue in
                guard let model else { return }
                Task { await model.setEnabled(newValue) }
            }
        )
    }
}
