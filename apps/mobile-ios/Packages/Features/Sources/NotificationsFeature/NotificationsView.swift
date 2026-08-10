// Notificações screen (spec 010, NOT.12-13 — aluno-20 / responsavel-09):
// back-arrow header, card rows (icon chip, title, body, relative
// timestamp), cursor pagination on scroll, honest empty state. Opening
// fires read-all — the dot dies (story 8). Row taps resolve the semantic
// route through the injected persona plan; unknown/null routes are inert.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct NotificationsView: View {
    @State private var model: NotificationsFeedModel
    private let persona: NotificationsPersona
    private let onNavigate: ((NotificationDestination) -> Void)?

    public init(
        persona: NotificationsPersona,
        repository: any NotificationsRepository,
        onBadgeCleared: (@MainActor () -> Void)? = nil,
        onNavigate: ((NotificationDestination) -> Void)? = nil
    ) {
        _model = State(initialValue: NotificationsFeedModel(
            repository: repository,
            onBadgeCleared: onBadgeCleared
        ))
        self.persona = persona
        self.onNavigate = onNavigate
    }

    public var body: some View {
        NotificationsContent(model: model, persona: persona, onNavigate: onNavigate)
    }
}

struct NotificationsContent: View {
    @Bindable var model: NotificationsFeedModel
    let persona: NotificationsPersona
    var onNavigate: ((NotificationDestination) -> Void)?

    @Environment(\.dismiss) private var dismiss
    /// One instant for the whole page — rows never disagree about "Hoje".
    private let now = Date()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                header
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    errorBanner(message)
                case .loaded:
                    if model.items.isEmpty {
                        emptyState
                    } else {
                        rows
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.top, LumiraTokens.Space.s4)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .task { await model.open() }
        .refreshable { await model.refresh() }
    }

    private var header: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.fg2)
                    .frame(width: 34, height: 34)
                    .background(LumiraTokens.Colors.bgSurface)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1))
            }
            .accessibilityIdentifier("notifications-back-button")
            Text(NotificationsMessages.title)
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Spacer()
        }
    }

    private var rows: some View {
        LazyVStack(spacing: LumiraTokens.Space.s3) {
            ForEach(model.items) { item in
                NotificationRowCard(
                    item: item,
                    now: now,
                    onTap: tapAction(for: item)
                )
                .onAppear {
                    // Cursor pagination: the tail row pulls the next page.
                    if item.id == model.items.last?.id, model.hasMore {
                        Task { await model.loadMore() }
                    }
                }
            }
            if model.isLoadingMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, LumiraTokens.Space.s3)
            }
        }
    }

    /// Route-hint navigation: nil when the row is inert for this persona.
    private func tapAction(for item: NotificationItem) -> (() -> Void)? {
        guard
            let onNavigate,
            let route = item.route,
            let destination = NotificationRoutePlan.destination(for: route, persona: persona)
        else { return nil }
        return { onNavigate(destination) }
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(LumiraTokens.Colors.bgSunken)
                    .frame(height: 72)
            }
        }
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "bell.slash")
                .font(.system(size: LumiraTokens.FontSize.textXl))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            Text(NotificationsMessages.empty)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg2)
            Text(NotificationsMessages.emptyCaption)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s10)
        .accessibilityIdentifier("notifications-empty")
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(LumiraTokens.Colors.warning500)
            Text(message)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg2)
            Spacer()
            Button("Tentar de novo") {
                Task { await model.open() }
            }
            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.inkPurple)
        }
        .padding(LumiraTokens.Space.s4)
        .background(LumiraTokens.Colors.warning100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("notifications-error")
    }
}
