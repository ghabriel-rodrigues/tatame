// Shared notification pieces (spec 010): the 42px home-header bell with the
// pink-500 unread dot (aluno-03 header, left of the avatar) and the feed
// row card per aluno-20 / responsavel-09 — 38px rounded chip in
// purple-50/purple-600 tones, bold title, body line, relative timestamp.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

/// The prototype's round header bell; the dot renders only while something
/// is unread (spec story 8 — the dot always means something new).
public struct NotificationsBellButton: View {
    let hasUnread: Bool
    let action: () -> Void

    public init(hasUnread: Bool, action: @escaping () -> Void) {
        self.hasUnread = hasUnread
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: "bell")
                .font(.system(size: LumiraTokens.FontSize.textMd))
                .foregroundStyle(ThemedColors.fg2)
                .frame(width: 42, height: 42)
                .background(ThemedColors.bgSurface)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(ThemedColors.border1, lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if hasUnread {
                        Circle()
                            .fill(ThemedColors.pink500)
                            .frame(width: 9, height: 9)
                            .overlay(Circle().strokeBorder(ThemedColors.bgApp, lineWidth: 1.5))
                            .offset(x: -3, y: 3)
                            .accessibilityIdentifier("notifications-unread-dot")
                    }
                }
        }
        .accessibilityIdentifier("notifications-bell-button")
        .accessibilityLabel(NotificationsMessages.title)
    }
}

/// Category fallback icon for rows whose chip text is null (spec: clients
/// fall back to a category icon).
extension NotificationCategory {
    var systemImage: String {
        switch self {
        case .payment: "creditcard"
        case .event: "calendar"
        case .graduation: "medal"
        case .attendance: "checkmark.circle"
        case .store: "bag"
        }
    }
}

/// One feed card (aluno-20 / responsavel-09).
struct NotificationRowCard: View {
    let item: NotificationItem
    /// Now injected by the screen so the whole page renders one instant.
    let now: Date
    var onTap: (() -> Void)?

    var body: some View {
        Button {
            onTap?()
        } label: {
            HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
                chipView
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg1)
                        .multilineTextAlignment(.leading)
                    if let body = item.body {
                        Text(body)
                            .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                            .foregroundStyle(ThemedColors.fg3)
                            .multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: LumiraTokens.Space.s2)
                Text(NotificationsFormatters.relativeTimestampPTBR(item.createdAt, now: now))
                    .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                    .foregroundStyle(ThemedColors.fg4)
            }
            .padding(LumiraTokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.border1, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        // Inert rows stay cards, not buttons, for assistive tech.
        .disabled(onTap == nil)
        .accessibilityIdentifier("notification-\(item.id.uuidString.lowercased())")
    }

    private var chipView: some View {
        ZStack {
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                .fill(ThemedColors.purple50)
                .frame(width: 38, height: 38)
            if let chip = item.chip {
                Text(chip)
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .bold))
                    .foregroundStyle(ThemedColors.purple600)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 2)
            } else {
                Image(systemName: item.category.systemImage)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.purple600)
            }
        }
    }
}
